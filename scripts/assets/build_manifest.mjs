// Write assets/runtime/manifest.json: every runtime file (key, path, type, size, licence, source, notes, tier)
// plus per-category sections the game loader can read directly. Paths are relative to assets/runtime/.
//   node scripts/assets/build_manifest.mjs
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARS } from './lib/catalog.mjs';
import { CLIPS } from './lib/clips.mjs';
import { MATERIALS } from './lib/materials.mjs';
import { TREES } from './lib/trees.mjs';
import { PROPS, FURNITURE } from './lib/props.mjs';
import { readGLB } from './lib/glb.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..'), RT = join(REPO, 'assets/runtime');
const data = (n) => (existsSync(join(HERE, 'data', n)) ? JSON.parse(readFileSync(join(HERE, 'data', n), 'utf8')) : {});
const vrmStats = data('vrm_stats.json'), animBake = data('anim_bake.json'), animMetrics = data('anim_metrics.json'), treeStats = data('trees.json'), propStats = data('props.json'), furnStats = data('furniture.json');

const L = {
  pixivCC0: { licence: 'CC0-1.0', credit: 'pixiv Inc. VRoid Project sample model (CC0; embedded VRM meta: VRoid Hub conditions, all uses allowed, credit unnecessary)' },
  m2m: { licence: 'CC0-1.0', source: 'https://github.com/Mesh2Motion/mesh2motion-app/tree/main/static/animations', credit: 'Mesh2Motion human animation library (CC0), incl. Quaternius Universal Animation Library 1+2 Standard (CC0)' },
  cmu: { licence: 'CMU mocap terms (free for all uses incl. commercial; no resale of the data itself)', source: 'http://mocap.cs.cmu.edu/', credit: 'The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.' },
  ph: { licence: 'CC0-1.0', credit: 'Poly Haven (polyhaven.com)' },
  acg: { licence: 'CC0-1.0', credit: 'ambientCG (ambientcg.com)' },
  ez: { licence: 'MIT (generator + leaf textures) / CC0 (bark: Poly Haven)', source: 'https://github.com/dgreenheck/ez-tree', credit: 'Generated with EZ-Tree by Daniel Greenheck (MIT); leaf textures from EZ-Tree (MIT); bark textures Poly Haven (CC0)' },
};
// VRM 0.x blend-shape presets -> three-vrm expression names (custom groups keep their own name)
const V0EXPR = { neutral: 'neutral', a: 'aa', i: 'ih', u: 'ou', e: 'ee', o: 'oh', blink: 'blink', blink_l: 'blinkLeft', blink_r: 'blinkRight', angry: 'angry', fun: 'relaxed', joy: 'happy', sorrow: 'sad', lookup: 'lookUp', lookdown: 'lookDown', lookleft: 'lookLeft', lookright: 'lookRight' };
const srcUrl = (src) => { const [k, id] = src.split(':'); return k === 'ph' ? `https://polyhaven.com/a/${id}` : `https://ambientcg.com/view?id=${id}`; };
const HDRI = {
  kloofendal_48d_partly_cloudy_puresky: 'day, partly cloudy (main midday sky / IBL)', kloppenheim_06_puresky: 'sunset / golden hour', qwantani_dusk_2_puresky: 'dusk / blue hour',
  kloppenheim_02_puresky: 'clear night with moon', kloofendal_overcast_puresky: 'overcast', kloofendal_misty_morning_puresky: 'haze / 雾霾 morning',
  shanghai_bund: 'city night (neon skyline reflections)', zhengyang_gate: 'real Beijing: 正阳门 Qianmen (local reflections near 天安门/前门)',
};

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { if (f.startsWith('.')) continue; const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(RT);
const entries = [];
for (const abs of files) {
  const path = relative(RT, abs).split('\\').join('/'), size = statSync(abs).size, parts = path.split('/');
  if (path === 'manifest.json') continue;
  const e = { key: '', path, type: '', size, tier: 'both', licence: '', source: '', notes: '' };
  const cat = parts[0], lo = parts[1] === 'lo';
  if (cat === 'chars') {
    const c = CHARS.find((x) => x.key === basename(path, '.vrm'));
    Object.assign(e, { key: c.key + (lo ? '@lo' : ''), type: 'vrm', tier: lo ? 'phone' : 'desktop', licence: c.licence, source: c.source, notes: `${c.name}. ${c.notes}${lo ? ' (phone: 512 px textures, no morph normals)' : ''}` });
  } else if (cat === 'anims') {
    const k = basename(path, '.vrma'), c = CLIPS.find((x) => x.key === k), cmu = c.src?.startsWith('cmu/');
    Object.assign(e, { key: k, type: 'vrma', licence: c.licence || (cmu ? L.cmu.licence : L.m2m.licence), source: c.source || (cmu ? `${L.cmu.source} (subject/trial ${c.src.slice(4)})` : `${L.m2m.source} (${c.src})`), notes: c.notes || '' });
  } else if (cat === 'tex') {
    const k = lo ? parts[2] : parts[1], map = basename(path, '.webp'), m = MATERIALS.find((x) => x.key === k) || MATERIALS.find((x) => x.sharedNormal === k);
    Object.assign(e, { key: `${k}.${map}${lo ? '@lo' : ''}`, type: 'texture', tier: lo ? 'phone' : 'desktop', licence: 'CC0-1.0', source: m.roughFrom ? `${srcUrl(m.src)} + ${srcUrl(m.roughFrom)} (roughness)` : srcUrl(m.src),
      notes: `${map}${map === 'arm' ? ' (R=AO, G=roughness, B=metalness)' : map === 'normal' ? ' (OpenGL +Y)' : map === 'albedo' ? ' (sRGB)' : ''}; ${m.sharedNormal === k ? 'shared normal map of the roof_* tiles' : m.use}` });
  } else if (cat === 'hdri') {
    const [, name, res] = basename(path, '.hdr').match(/^(.*)_(\dk)$/);
    Object.assign(e, { key: `${name}_${res}`, type: 'hdri', tier: res === '2k' ? 'desktop' : 'both', licence: 'CC0-1.0', source: `https://polyhaven.com/a/${name}`, notes: HDRI[name] + (res === '1k' ? ' (1k: phone + fallback)' : '') });
  } else if (cat === 'trees') {
    const k = basename(path).replace(/(_impostor)?\.(glb|webp)$/, ''), t = TREES.find((x) => x.key === k), imp = path.endsWith('.webp');
    Object.assign(e, { key: k + (imp ? '_impostor' : ''), type: imp ? 'impostor' : 'glb', licence: L.ez.licence, source: L.ez.source, notes: imp ? `${t.name}: 2x2 impostor atlas (views 0/45/90/135 deg, orthographic, alpha)` : `${t.name}: nodes lod0 / lod1 (bark, leaves); custom attribute _wind (0 base .. 1 top)` });
  } else if (cat === 'props') {
    const k = basename(path, '.glb'), p = PROPS.find((x) => x.key === k);
    Object.assign(e, { key: k, type: 'glb', licence: 'CC0-1.0', source: `https://polyhaven.com/a/${k}`, notes: `${p.use}; by ${p.author} (Poly Haven)` });
  } else if (cat === 'furniture') {
    const k = basename(path, '.glb'), p = FURNITURE.find((x) => x.key === k);
    Object.assign(e, { key: k, type: 'glb', licence: 'CC0-1.0', source: `https://polyhaven.com/a/${k}`, notes: `${p.use}; by ${p.author} (Poly Haven)` });
  } else Object.assign(e, { key: path, type: 'other' });
  entries.push(e);
}
entries.sort((a, b) => a.path.localeCompare(b.path));
const sum = (f) => entries.filter(f).reduce((s, e) => s + e.size, 0), MB = (b) => +(b / 1048576).toFixed(1);

const manifest = {
  name: 'Grand Token Auto runtime assets', version: 1, generated: new Date().toISOString().slice(0, 10), base: 'assets/runtime/',
  howToLoad: {
    vrm: 'GLTFLoader + VRMLoaderPlugin (@pixiv/three-vrm 3.x); textures are EXT_texture_webp. VRM 0.x: VRMUtils.rotateVRM0(vrm). Expressions: chars[].expressions (three-vrm names; custom "ko" = hidden iris/highlight where present). Create a VRMLookAtQuaternionProxy per VRM before createVRMAnimationClip to avoid its warning.',
    vrma: 'GLTFLoader + VRMAnimationLoaderPlugin; createVRMAnimationClip(gltf.userData.vrmAnimations[0], vrm). In place: add `travel` (m, over the clip) in the controller for root motion. Locomotion playbackRate = moveSpeed / (speedPerHipsY * vrm.humanoid.normalizedRestPose.hips.position[1]).',
    texture: 'TextureLoader (WebP). albedo = sRGB; normal = OpenGL; arm -> aoMap (R) + roughnessMap (G) + metalnessMap (B) (aoMap needs uv1 = uv). tile = metres per repeat.',
    hdri: 'HDRLoader (three r17x+; RGBELoader in older builds) + PMREMGenerator.fromEquirectangular.',
    glb: 'GLTFLoader.setMeshoptDecoder(MeshoptDecoder); uses EXT_meshopt_compression, KHR_mesh_quantization, EXT_texture_webp, KHR_texture_transform (tree bark).',
    phone: 'tier "phone" files replace "desktop" ones (chars/lo, tex/lo); "both" is shared. Trees: lod1 + impostor on phones.',
  },
  totals: { files: entries.length, allMB: MB(sum(() => true)), desktopMB: MB(sum((e) => e.tier !== 'phone')), phoneMB: MB(sum((e) => e.tier !== 'desktop')) },
  chars: CHARS.map((c) => { const s = vrmStats.find?.((x) => x.key === c.key && x.tier === 1024) || {}; const vj = existsSync(join(RT, `chars/${c.key}.vrm`)) ? readGLB(join(RT, `chars/${c.key}.vrm`)).json.extensions.VRM : null;
    return { key: c.key, name: c.name, gender: c.gender, role: c.role, path: `chars/${c.key}.vrm`, lo: `chars/lo/${c.key}.vrm`, expressions: vj ? vj.blendShapeMaster.blendShapeGroups.map((g) => V0EXPR[g.presetName] || g.name) : [], tris: s.tris, materials: s.materials, drawPrims: s.prims?.split('->')[1] | 0, springGroups: s.springGroups, morphTargets: s.morphTargets, licence: c.licence, source: c.source, page: c.page, notes: c.notes }; }),
  anims: CLIPS.map((c) => { const b = (animBake.find?.((x) => x.key === c.key)) || {}, m = animMetrics[c.key] || {}; const o = { key: c.key, path: c.alias ? null : `anims/${c.key}.vrma`, loop: !!c.loop, tags: c.tags || [] };
    if (c.alias) o.alias = c.alias; if (m.dur ?? b.dur) o.duration = m.dur ?? b.dur; if (b.travel && Math.hypot(...b.travel) > 0.02) o.travel = b.travel; if (m.speedPerHipsY && /walk|jog|run|sprint|strafe|flee/.test(c.key)) { o.speed = m.speed; o.speedPerHipsY = m.speedPerHipsY; }
    o.source = c.copy ? c.source : c.src; if (c.notes) o.notes = c.notes; return o; }),
  materials: MATERIALS.map((m) => { const d = `tex/${m.key}/`, lo = `tex/lo/${m.key}/`, n = m.sharedNormal ? `tex/${m.sharedNormal}/normal.webp` : d + 'normal.webp';
    const maps = { albedo: d + 'albedo.webp', normal: n, arm: d + 'arm.webp' }; if (m.emissive) maps.emissive = d + 'emissive.webp';
    const loMaps = Object.fromEntries(Object.entries(maps).map(([k, v]) => [k, v.replace(/^tex\//, 'tex/lo/')]));
    return { key: m.key, res: Math.min(m.res, 1024), tile: m.tile, maps, // (desktop files are capped at 1024: process_textures.mjs)
      lo: loMaps, alpha: !!m.alpha, sharedNormal: m.sharedNormal, use: m.use, source: m.roughFrom ? [srcUrl(m.src), srcUrl(m.roughFrom)] : srcUrl(m.src), licence: 'CC0-1.0',
      ...(m.recolour ? { recolour: m.recolour } : {}), ...(m.tint ? { tint: m.tint } : {}) }; }),
  hdri: Object.entries(HDRI).filter(([k]) => existsSync(join(RT, `hdri/${k}_1k.hdr`))).map(([k, use]) => ({ key: k, use, path1k: `hdri/${k}_1k.hdr`, ...(existsSync(join(RT, `hdri/${k}_2k.hdr`)) ? { path2k: `hdri/${k}_2k.hdr` } : {}), source: `https://polyhaven.com/a/${k}`, licence: 'CC0-1.0' })),
  trees: TREES.map((t) => ({ key: t.key, name: t.name, path: `trees/${t.key}.glb`, impostor: `trees/${t.key}_impostor.webp`, height: t.height, ...(treeStats[t.key] ? { size: treeStats[t.key].size, tris: treeStats[t.key].tris, impostorInfo: treeStats[t.key].impostor } : {}), licence: L.ez.licence })),
  props: PROPS.map((p) => ({ key: p.key, path: `props/${p.key}.glb`, use: p.use, author: p.author, ...(propStats[p.key] ? { tris: propStats[p.key].tris, nodes: propStats[p.key].nodes } : {}), source: `https://polyhaven.com/a/${p.key}`, licence: 'CC0-1.0' })),
  furniture: FURNITURE.map((p) => ({ key: p.key, path: `furniture/${p.key}.glb`, use: p.use, author: p.author, ...(furnStats[p.key] ? { tris: furnStats[p.key].tris, nodes: furnStats[p.key].nodes } : {}), source: `https://polyhaven.com/a/${p.key}`, licence: 'CC0-1.0' })),
  files: entries,
};
writeFileSync(join(RT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log('manifest:', manifest.totals, 'chars', manifest.chars.length, 'anims', manifest.anims.length, 'materials', manifest.materials.length, 'hdri', manifest.hdri.length, 'trees', manifest.trees.length, 'props', manifest.props.length, 'furniture', manifest.furniture.length);
