#!/usr/bin/env node
// Inspect a GLB for realism problems: scale, UVs, materials, textures, triangle count.
// Usage: node inspect_glb.mjs model.glb
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const file = process.argv[2];
if (!file) { console.error('Usage: node inspect_glb.mjs model.glb'); process.exit(1); }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];

const issues = [];
const b = getBounds(scene);
const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
console.log(`\n== ${file}`);
console.log(`Bounding size (m): X ${size[0]}  Y(up) ${size[1]}  Z ${size[2]}`);
const maxDim = Math.max(...size);
if (maxDim > 1000) issues.push(`Very large (${maxDim} m) — likely exported in mm or cm; set config "scale" to 0.001 or 0.01`);
if (maxDim < 0.5) issues.push(`Very small (${maxDim} m) — likely wrong units; check config "scale"`);
if (b.min[1] < -0.05 || b.min[1] > 0.05) issues.push(`Floor not at Y=0 (min Y ${b.min[1].toFixed(3)}) — the viewer uses min Y as floor for grime`);

let tris = 0, meshesNoUV = [], meshesUV2 = 0;
for (const mesh of root.listMeshes()) {
  let hasUV = true, hasUV2 = false;
  for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices();
    const pos = p.getAttribute('POSITION');
    tris += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
    if (!p.getAttribute('TEXCOORD_0')) hasUV = false;
    if (p.getAttribute('TEXCOORD_1')) hasUV2 = true;
  }
  if (!hasUV) meshesNoUV.push(mesh.getName() || '(unnamed)');
  if (hasUV2) meshesUV2++;
}
console.log(`Meshes: ${root.listMeshes().length}   Nodes: ${root.listNodes().length}   Triangles: ${Math.round(tris).toLocaleString()}`);
console.log(`Meshes with 2nd UV (lightmap-ready): ${meshesUV2}`);
if (meshesNoUV.length) issues.push(`${meshesNoUV.length} mesh(es) without UVs (textures cannot map): ${meshesNoUV.slice(0, 10).join(', ')}${meshesNoUV.length > 10 ? ' …' : ''}`);
if (tris > 3_000_000) issues.push(`High triangle count (${Math.round(tris).toLocaleString()}) — consider decimating props or instancing repeats`);

console.log(`\nMaterials (${root.listMaterials().length}):`);
let flat = 0;
for (const m of root.listMaterials()) {
  const maps = [];
  if (m.getBaseColorTexture()) maps.push('albedo');
  if (m.getNormalTexture()) maps.push('normal');
  if (m.getMetallicRoughnessTexture()) maps.push('ORM');
  if (m.getOcclusionTexture()) maps.push('occlusion');
  if (m.getEmissiveTexture()) maps.push('emissive');
  const c = m.getBaseColorFactor().slice(0, 3).map(v => v.toFixed(2)).join(',');
  const em = m.getEmissiveFactor().some(v => v > 0) ? ' EMISSIVE' : '';
  console.log(`  - ${m.getName() || '(unnamed)'}: color(${c}) metal ${m.getMetallicFactor().toFixed(2)} rough ${m.getRoughnessFactor().toFixed(2)} maps[${maps.join(',') || 'none'}]${em}`);
  if (!maps.length) flat++;
  const bc = m.getBaseColorFactor();
  if (Math.max(bc[0], bc[1], bc[2]) > 0.95 && !m.getBaseColorTexture()) issues.push(`Material "${m.getName()}" albedo near pure white — real surfaces rarely exceed ~0.8`);
}
if (flat) issues.push(`${flat} material(s) with no textures at all — flat colors are the #1 CG giveaway`);

const texBytes = root.listTextures().reduce((s, t) => s + (t.getImage()?.byteLength || 0), 0);
console.log(`\nTextures: ${root.listTextures().length} (${(texBytes / 1e6).toFixed(1)} MB)`);
console.log(`Animations: ${root.listAnimations().length}`);

console.log(`\n== Issues (${issues.length})`);
issues.forEach((s, i) => console.log(`${i + 1}. ${s}`));
if (!issues.length) console.log('None detected by static checks — judge the rest from screenshots.');
