// Source catalogue: every runtime asset's origin, licence and credit. Used by the processors and by
// build_manifest.mjs (assets/runtime/manifest.json) and mirrored in assets/ATTRIBUTION.md.
const PIXIV_CC0 = 'CC0-1.0';
const PIXIV_CUSTOM = 'pixiv VRoidPreset terms (NOT CC0)';
const OGA = 'https://opengameart.org/content/vroid-studio-cc0-models';
const MADJIN = 'https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/';

// file = name inside the raw/vrm folder (unzipped OGA archive or madjin mirror file)
export const CHARS = [
  { key: 'hairsample_male', file: 'HairSample_Male.vrm', name: 'HairSample_Male', gender: 'm', role: 'hero', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/hairsample_male.zip', page: OGA,
    notes: 'Male hero: black hair, white hoodie, dark trousers' },
  { key: 'sendagaya_shino', file: 'Sendagaya Shino.vrm', name: '千駄ヶ谷篠 Sendagaya Shino', gender: 'f', role: 'lead', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/sendagaya_shino.zip', page: 'https://vroid.pixiv.help/hc/en-us/articles/360013482714-Sendagaya-Shino',
    notes: 'Female lead #1: long straight black hair, school uniform' },
  { key: 'vita', file: 'AvatarSample_F.vrm', name: 'ヴィータ Vita (β AvatarSample_3)', gender: 'f', role: 'lead', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/avatarsample_f.zip', page: 'https://vroid.pixiv.help/hc/en-us/articles/360014900113',
    notes: 'Female lead #2: silver/blue hair, glowing cyber bodysuit (emissive, bloom-friendly)' },
  { key: 'sendagaya_shibu', file: 'AvatarSample_D.vrm', name: '千駄ヶ谷渋 Sendagaya Shibu (β AvatarSample_1)', gender: 'f', role: 'ped', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/avatarsample_d_0.zip', page: 'https://vroid.pixiv.help/hc/en-us/articles/360012381793',
    notes: 'Ped: short black bob, school uniform' },
  { key: 'darkness_shibu', file: 'AvatarSample_D_Darkness.vrm', name: 'Darkness Shibu (β AvatarSample_1 dark)', gender: 'f', role: 'ped', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/avatarsample_d_darkness.zip', page: 'https://vroid.pixiv.help/hc/en-us/articles/360012381793',
    notes: 'Ped: gothic dark palette variant of Shibu' },
  { key: 'vivi', file: 'AvatarSample_E.vrm', name: 'ビビ Vivi (β AvatarSample_2)', gender: 'f', role: 'ped', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/avatarsample_e.zip', page: 'https://vroid.pixiv.help/hc/en-us/articles/360014900273',
    notes: 'Ped: brunette bob, green apron dress (shop keeper / waitress)' },
  { key: 'victoria_rubin', file: 'AvatarSample_G.vrm', name: 'ヴィクトリア・ルービン Victoria Rubin (β AvatarSample_4)', gender: 'f', role: 'ped', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/avatarsample_g.zip', page: 'https://vroid.pixiv.help/hc/en-us/articles/360014900233',
    notes: 'Ped: blonde twin-tails, pastel lolita dress (tourist / fashion girl)' },
  { key: 'hairsample_female', file: 'HairSample_Female.vrm', name: 'HairSample_Female', gender: 'f', role: 'ped', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/hairsample_female.zip', page: OGA,
    notes: 'Ped: plain young woman, simple outfit' },
  { key: 'sakurada_fumiriya', file: 'Sakurada Fumiriya.vrm', name: '桜田史利矢 Sakurada Fumiriya', gender: 'm', role: 'ped', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/sakurada_fumiriya.zip', page: 'https://vroid.pixiv.help/hc/en-us/articles/360014788554-Sakurada-Fumiriya',
    notes: 'Ped / alt hero: tall young man, light-brown hair, school uniform with vest and tie' },
  { key: 'base_male', file: 'Base_Male.vrm', name: 'VRoid Base_Male (0.14)', gender: 'm', role: 'ped', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/base_male.zip', page: OGA,
    notes: 'Blank male base: no hair mesh, default outfit; for recolours' },
  { key: 'base_female', file: 'Base_Female.vrm', name: 'VRoid Base_Female (0.14)', gender: 'f', role: 'ped', licence: PIXIV_CC0, source: 'https://opengameart.org/sites/default/files/base_female.zip', page: OGA,
    notes: 'Blank female base: no hair mesh, default outfit; for recolours' },
  { key: 'avatarsample_a', file: 'AvatarSample_A.vrm', name: 'AvatarSample_A (VRoidPreset A)', gender: 'f', role: 'ped', licence: PIXIV_CUSTOM, source: MADJIN + 'AvatarSample_A.vrm', page: 'https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z',
    notes: 'Casual girl: brown bob, cream cardigan. pixiv terms: free use/edit/redistribute, no credit; do not relabel as CC0, no paid redistribution, no character-creation service' },
  { key: 'avatarsample_b', file: 'AvatarSample_B.vrm', name: 'AvatarSample_B (VRoidPreset B)', gender: 'f', role: 'ped', licence: PIXIV_CUSTOM, source: MADJIN + 'AvatarSample_B.vrm', page: 'https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z',
    notes: 'Street-fashion girl: long twin-tails, varsity jacket. Same pixiv terms as A' },
  { key: 'avatarsample_c', file: 'AvatarSample_C.vrm', name: 'AvatarSample_C (VRoidPreset C)', gender: 'm', role: 'hero_alt', licence: PIXIV_CUSTOM, source: MADJIN + 'AvatarSample_C.vrm', page: 'https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z',
    notes: 'Cool male in black techwear (alt hero / rival). Same pixiv terms as A' },
];
