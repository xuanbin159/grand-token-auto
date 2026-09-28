// Environment textures -> runtime WebP sets: albedo (sRGB, RGBA for leaves), normal (OpenGL +Y),
// arm (R = AO, G = roughness, B = metalness; plugs straight into aoMap / roughnessMap / metalnessMap),
// optional emissive. Desktop at the material's res, phone copies at 512 under tex/lo/.
//   node scripts/assets/process_textures.mjs [--raw DIR] [--only key,key]
import sharp from 'sharp';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATERIALS } from './lib/materials.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const RAW = opt('raw', process.env.GTA_RAW || join(REPO, 'assets/_raw')), OUT = join(REPO, 'assets/runtime/tex');
const only = opt('only', '') ? opt('only').split(',') : null;
const LO = 512;
// desktop copies are capped at the game's PBR.S (1024, 04a_bjtex.js): it decodes every map down to that anyway, so a 2048 file was
// 4x the download for pixels thrown away. A material's res (lib/materials.mjs) is the source resolution it's built from.
const DESK = 1024;

// --- colour helpers ---
const toLin = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toSrgb = (l) => { l = Math.min(1, Math.max(0, l)); return Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)); };
const hexLin = (h) => [1, 3, 5].map((i) => toLin[parseInt(h.slice(i, i + 2), 16)]);

// --- source file lookup ---
function srcFiles(src) {
  const [kind, id] = src.split(':');
  if (kind === 'ph') {
    const dir = join(RAW, 'tex/ph', id), r = existsSync(join(dir, `${id}_Diffuse_2k.jpg`)) ? '2k' : '1k';
    return { albedo: join(dir, `${id}_Diffuse_${r}.jpg`), normal: join(dir, `${id}_nor_gl_${r}.jpg`), arm: join(dir, `${id}_arm_${r}.jpg`) };
  }
  const dir = join(RAW, 'tex/acg', id), r = existsSync(join(dir, `${id}_2K-JPG_Color.jpg`)) ? '2K' : '1K', f = (m) => { const p = join(dir, `${id}_${r}-JPG_${m}.jpg`); return existsSync(p) ? p : null; };
  return { albedo: f('Color'), normal: f('NormalGL'), rough: f('Roughness'), ao: f('AmbientOcclusion'), metal: f('Metalness'), opacity: f('Opacity'), emission: f('Emission') };
}
const raw = async (path, size, ch = 3) => {
  let p = sharp(path).resize(size, size, { fit: 'fill', kernel: 'lanczos3' });
  p = ch === 1 ? p.toColourspace('b-w').extractChannel(0) : p.removeAlpha();
  const { data } = await p.raw().toBuffer({ resolveWithObject: true });
  return data;
};
const enc = (data, size, ch, q, path) => sharp(data, { raw: { width: size, height: size, channels: ch } }).webp({ quality: q, alphaQuality: 95, smartSubsample: true, effort: 6 }).toFile(path);
const pct = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.floor(p * (s.length - 1))]; };

async function buildMaterial(m, size) {
  const f = srcFiles(m.src), n = size * size, out = {};
  // albedo
  const rgb = await raw(f.albedo, size);
  if (m.tint || m.recolour) {
    const t = hexLin(m.tint || m.recolour), lin = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) lin[i] = toLin[rgb[i]];
    if (m.tint) { // per-channel gain in linear light: keeps texture variation, moves the mean to the target
      const mean = [0, 1, 2].map((c) => { let s = 0; for (let i = c; i < n * 3; i += 3) s += lin[i]; return s / n; });
      for (let i = 0; i < n * 3; i++) rgb[i] = toSrgb(lin[i] * (t[i % 3] / mean[i % 3]));
    } else { // regenerate from luminance (glazed / clay tiles)
      const lum = new Float32Array(n); let ml = 0;
      for (let i = 0; i < n; i++) { lum[i] = 0.2126 * lin[3 * i] + 0.7152 * lin[3 * i + 1] + 0.0722 * lin[3 * i + 2]; ml += lum[i]; } ml /= n;
      for (let i = 0; i < n; i++) { const v = Math.pow(lum[i] / ml, 0.85); for (let c = 0; c < 3; c++) rgb[3 * i + c] = toSrgb(t[c] * v); }
    }
  }
  if (m.alpha && f.opacity) {
    const a = await raw(f.opacity, size, 1), rgba = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) { rgba[4 * i] = rgb[3 * i]; rgba[4 * i + 1] = rgb[3 * i + 1]; rgba[4 * i + 2] = rgb[3 * i + 2]; rgba[4 * i + 3] = a[i]; }
    out.albedo = { data: rgba, ch: 4, q: 88 };
  } else out.albedo = { data: rgb, ch: 3, q: 86 };
  // normal
  out.normal = { data: await raw(f.normal, size), ch: 3, q: 90 };
  // ARM
  let arm;
  if (f.arm) arm = await raw(f.arm, size);
  else {
    arm = Buffer.alloc(n * 3);
    const ao = f.ao ? await raw(f.ao, size, 1) : null, ro = f.rough ? await raw(f.rough, size, 1) : null, me = f.metal ? await raw(f.metal, size, 1) : null;
    for (let i = 0; i < n; i++) { arm[3 * i] = ao ? ao[i] : 255; arm[3 * i + 1] = ro ? ro[i] : 200; arm[3 * i + 2] = me ? me[i] : 0; }
  }
  if (m.roughFrom) { const g = await raw(srcFiles(m.roughFrom).arm, size); for (let i = 0; i < n; i++) arm[3 * i + 1] = g[3 * i + 1]; }
  if (m.rough) { // remap roughness percentiles 5..95 into [min, max]
    const g = new Uint8Array(n); for (let i = 0; i < n; i++) g[i] = arm[3 * i + 1];
    const lo = pct(g, 0.05), hi = Math.max(lo + 1, pct(g, 0.95));
    for (let i = 0; i < n; i++) arm[3 * i + 1] = Math.round(255 * (m.rough[0] + (m.rough[1] - m.rough[0]) * Math.min(1, Math.max(0, (g[i] - lo) / (hi - lo)))));
  }
  out.arm = { data: arm, ch: 3, q: 86 };
  if (m.emissive && f.emission) out.emissive = { data: await raw(f.emission, size), ch: 3, q: 82 };
  return out;
}

const report = [];
for (const m of MATERIALS) {
  if (only && !only.includes(m.key)) continue;
  for (const [size, dir] of [[Math.min(m.res, DESK), join(OUT, m.key)], [LO, join(OUT, 'lo', m.key)]]) {
    mkdirSync(dir, { recursive: true });
    const maps = await buildMaterial(m, size), files = {};
    for (const [k, v] of Object.entries(maps)) {
      let path = join(dir, k + '.webp');
      if (k === 'normal' && m.sharedNormal) { const d = join(dirname(dir), m.sharedNormal); mkdirSync(d, { recursive: true }); path = join(d, 'normal.webp'); }
      const r = await enc(v.data, size, v.ch, v.q, path); files[k] = Math.round(r.size / 1024);
    }
    report.push({ key: m.key, size, kb: files }); console.log(m.key.padEnd(22), size, JSON.stringify(files));
  }
}
writeFileSync(join(RAW, 'tex_report.json'), JSON.stringify(report, null, 1));
