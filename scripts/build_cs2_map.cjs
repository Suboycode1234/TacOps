const fs = require('fs');
const path = require('path');

console.log('[CS2 Map Builder] Starting extraction from Valve physics mesh...');
const glbBuf = fs.readFileSync('H:/TacopsModels/Maps/Dust II/FALLBACKOFFICIAL/decompiled_world/maps/de_dust2_d_prefab/world_physics_physics.glb');
const jsonLen = glbBuf.readUInt32LE(12);
const gltf = JSON.parse(glbBuf.toString('utf8', 20, 20 + jsonLen));
const binChunkOffset = 20 + jsonLen;
const binData = glbBuf.subarray(binChunkOffset + 8);

function getAccessorData(accIdx) {
  const acc = gltf.accessors[accIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const count = acc.count;
  if (acc.componentType === 5126 && acc.type === 'VEC3') {
    const stride = bv.byteStride || 12;
    const res = [];
    for (let i = 0; i < count; i++) {
      const o = byteOffset + i * stride;
      res.push([binData.readFloatLE(o), binData.readFloatLE(o + 4), binData.readFloatLE(o + 8)]);
    }
    return res;
  }
  if (acc.type === 'SCALAR') {
    const res = [];
    if (acc.componentType === 5123) {
      for (let i = 0; i < count; i++) res.push(binData.readUInt16LE(byteOffset + i * 2));
    } else if (acc.componentType === 5125) {
      for (let i = 0; i < count; i++) res.push(binData.readUInt32LE(byteOffset + i * 4));
    }
    return res;
  }
  return null;
}

const SCALE = 0.0254;
const floorTriangles = [];
const uniqueWalls = new Map();

for (let mIdx = 0; mIdx < gltf.meshes.length; mIdx++) {
  const mesh = gltf.meshes[mIdx];
  for (const prim of mesh.primitives) {
    const positions = getAccessorData(prim.attributes.POSITION);
    const indices = getAccessorData(prim.indices);
    const triCount = indices ? indices.length / 3 : positions.length / 3;

    for (let t = 0; t < triCount; t++) {
      const i0 = indices ? indices[t * 3] : t * 3;
      const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;
      const s0 = positions[i0], s1 = positions[i1], s2 = positions[i2];

      const a = [Number((s0[1] * SCALE).toFixed(3)), Number((s0[2] * SCALE).toFixed(3)), Number((s0[0] * SCALE).toFixed(3))];
      const b = [Number((s1[1] * SCALE).toFixed(3)), Number((s1[2] * SCALE).toFixed(3)), Number((s1[0] * SCALE).toFixed(3))];
      const c = [Number((s2[1] * SCALE).toFixed(3)), Number((s2[2] * SCALE).toFixed(3)), Number((s2[0] * SCALE).toFixed(3))];

      const v0x = b[0] - a[0], v0y = b[1] - a[1], v0z = b[2] - a[2];
      const v1x = c[0] - a[0], v1y = c[1] - a[1], v1z = c[2] - a[2];
      let nx = v0y * v1z - v0z * v1y;
      let ny = v0z * v1x - v0x * v1z;
      let nz = v0x * v1y - v0y * v1x;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-6) continue;
      nx /= len; ny /= len; nz /= len;

      const minY = Math.min(a[1], b[1], c[1]);
      const maxY = Math.max(a[1], b[1], c[1]);
      const avgY = Number(((a[1] + b[1] + c[1]) / 3).toFixed(3));

      // Floors: upward normal (ny >= 0.55), playable elevation (-4.5m to 16.5m)
      if (ny >= 0.55 && avgY >= -4.5 && avgY <= 16.5) {
        const minX = Math.min(a[0], b[0], c[0]);
        const maxX = Math.max(a[0], b[0], c[0]);
        const minZ = Math.min(a[2], b[2], c[2]);
        const maxZ = Math.max(a[2], b[2], c[2]);
        const d = Number((-(nx * a[0] + ny * a[1] + nz * a[2])).toFixed(3));

        floorTriangles.push({
          a, b, c,
          minX, maxX, minY, maxY, minZ, maxZ,
          nx: Number(nx.toFixed(3)),
          ny: Number(ny.toFixed(3)),
          nz: Number(nz.toFixed(3)),
          d, avgY
        });
      }

      // Walls: vertical or steep (abs(ny) <= 0.35)
      if (Math.abs(ny) <= 0.35 && maxY >= -3.5 && minY <= 15.0) {
        const d_ab = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const d_bc = Math.hypot(c[0] - b[0], c[2] - b[2]);
        const d_ca = Math.hypot(a[0] - c[0], a[2] - c[2]);
        let p1, p2;
        if (d_ab >= d_bc && d_ab >= d_ca) { p1 = a; p2 = b; }
        else if (d_bc >= d_ab && d_bc >= d_ca) { p1 = b; p2 = c; }
        else { p1 = c; p2 = a; }

        let x1 = p1[0], z1 = p1[2], x2 = p2[0], z2 = p2[2];
        if (x1 > x2 || (Math.abs(x1 - x2) < 0.05 && z1 > z2)) {
          const tx = x1; x1 = x2; x2 = tx;
          const tz = z1; z1 = z2; z2 = tz;
        }
        const edgeLen = Math.hypot(x2 - x1, z2 - z1);
        if (edgeLen >= 0.8) {
          const key = Math.round(x1 * 3) + '_' + Math.round(z1 * 3) + '_' + Math.round(x2 * 3) + '_' + Math.round(z2 * 3);
          if (!uniqueWalls.has(key)) {
            uniqueWalls.set(key, {
              p1: [Number(x1.toFixed(3)), Number(z1.toFixed(3))],
              p2: [Number(x2.toFixed(3)), Number(z2.toFixed(3))],
              minY: Number(minY.toFixed(3)),
              maxY: Number(maxY.toFixed(3)),
              nx: Number(nx.toFixed(3)),
              nz: Number(nz.toFixed(3))
            });
          }
        }
      }
    }
  }
}

const wallSegments = Array.from(uniqueWalls.values());
console.log('[CS2 Map Builder] Extracted ' + floorTriangles.length + ' floor triangles and ' + wallSegments.length + ' wall segments.');

// Build texture map
const texFiles = fs.readdirSync('public/models/Maps/Dust2/textures_cs2/').filter(f => f.endsWith('.png'));

// Visual GLB
const visualBuf = fs.readFileSync('public/models/Maps/Dust2/cs2_dust2.glb');
const vJsonLen = visualBuf.readUInt32LE(12);
const visualGltf = JSON.parse(visualBuf.toString('utf8', 20, 20 + vJsonLen));

const textureMap = {};
for (const node of visualGltf.nodes) {
  if (!node.name) continue;
  if (node.name.includes('blocklight') || node.name.includes('shadow') || node.name.includes('overlay')) continue;
  const m = node.name.match(/agg\d+_\d+_(.+?)(?:_\d+)?$/);
  if (!m) continue;
  const tag = m[1].toLowerCase();
  if (textureMap[tag]) continue;

  let found = texFiles.find(f => {
    const base = f.toLowerCase();
    return base.startsWith(tag + '_color') || base.startsWith(tag + '_tga') || base.startsWith(tag + 'a_color');
  });
  if (!found) {
    const simplified = tag.replace(/_fragment\d+/, '').replace(/_\d+$/, '');
    found = texFiles.find(f => f.toLowerCase().includes(simplified) && f.includes('color'));
  }
  if (!found) {
    if (tag.includes('blacktopsand')) found = texFiles.find(f => f.includes('blacktop_ext'));
    else if (tag.includes('sandhighway')) found = texFiles.find(f => f.includes('highway_01a'));
    else if (tag.includes('concretefloor001a')) found = texFiles.find(f => f.includes('concretefloor001a'));
    else if (tag.includes('residbwall')) found = texFiles.find(f => f.includes('residbwall'));
    else if (tag.includes('residwall')) found = texFiles.find(f => f.includes('residwall'));
    else if (tag.includes('sitebwall')) found = texFiles.find(f => f.includes('sitebwall'));
    else if (tag.includes('templewall')) found = texFiles.find(f => f.includes('templewall'));
    else if (tag.includes('marketwall')) found = texFiles.find(f => f.includes('marketwall'));
    else if (tag.includes('concrete')) found = texFiles.find(f => f.includes('concrete_ext'));
  }
  if (found) {
    textureMap[tag] = found;
  }
}

// Explicit mappings for critical floor and wall materials
textureMap['blend_blacktopsand'] = 'blacktop_ext_01c_color_tga_6a0ecf73.png';
textureMap['blend_blacktopsand_01'] = 'blacktop_ext_01c_color_tga_6a0ecf73.png';
textureMap['blend_sandhighway'] = 'highway_01a_color_tga_ff31c979.png';
textureMap['blend_sandhighway_01'] = 'highway_01a_color_tga_ff31c979.png';
textureMap['citadel_tilefloor016a'] = 'tilefloor016a_color_tga_246e546.png';
textureMap['dust_palacewall01_nospec'] = 'dust_palacewall01_color_tga_113ff119.png';
textureMap['metalwall001b_cheap'] = 'metalwall001b_color_tga_ab6cfed0.png';
textureMap['urban_palm_trunkdust_animated'] = 'urban_palm_trunkdust_color_tga_683c122b.png';
textureMap['urban_trees_branches02_mip0'] = 'urban_trees_branches02_color_tga_87b08ac9.png';
textureMap['urban_trees_branches03_animated'] = 'urban_trees_branches03_color_tga_bb9144d4.png';
textureMap['building_concrete'] = 'concrete_ext_04_color_tga_14713c23.png';
textureMap['light_shop_off'] = 'black_vmat_g_tcolor_20638b28.png';

console.log('[CS2 Map Builder] Total texture map entries:', Object.keys(textureMap).length);

// Spawns
const spawns = {
  CT: [
    [ 58.072, -2.769, 5.662 ],
    [ 58.634, -2.769, 3.901 ],
    [ 56.144, -2.769, 6.717 ],
    [ 54.208, -2.769, 5.528 ],
    [ 53.776, -2.769, 3.476 ],
    [ 53.402, -2.769, 9.706 ],
    [ 53.315, -2.769, 11.553 ],
    [ 54.991, -2.769, 8.188 ],
    [ 57.169, -2.769, 8.836 ],
    [ 58.117, -2.769, 10.706 ],
    [ 61.951, -2.769, 4.629 ],
    [ 60.190, -2.769, 4.067 ],
    [ 63.006, -2.769, 6.557 ],
    [ 61.817, -2.769, 8.493 ],
    [ 59.765, -2.769, 8.925 ]
  ],
  T: [
    [ -20.523, 3.422, -12.522 ],
    [ -19.152, 3.422, -13.538 ],
    [ -21.412, 3.422, -10.871 ],
    [ -20.523, 3.422, -9.322 ],
    [ -19.152, 3.422, -8.433 ],
    [ -20.523, 3.828, -28.981 ],
    [ -19.152, 3.828, -29.997 ],
    [ -21.412, 3.828, -27.330 ],
    [ -20.523, 3.828, -25.781 ],
    [ -19.152, 3.828, -24.892 ],
    [ -20.209, 3.828, -20.888 ],
    [ -18.754, 3.828, -21.781 ],
    [ -21.239, 3.828, -19.321 ],
    [ -20.488, 3.828, -17.700 ],
    [ -19.199, 3.828, -16.695 ]
  ]
};

const mapData = {
  name: 'Counter-Strike 2 Official Dust II',
  glbUrl: '/models/Maps/Dust2/cs2_dust2.glb',
  bounds: { minX: -36.0, maxX: 125.0, minZ: -95.0, maxZ: 58.0, voidY: -6.5 },
  buyZoneCT: { minX: 48.0, maxX: 68.0, minZ: 0.0, maxZ: 15.0 },
  buyZoneT: { minX: -26.0, maxX: -14.0, minZ: -32.0, maxZ: -6.0 },
  spawns,
  textureMap,
  floorTriangles,
  wallSegments,
  colliders: []
};

fs.writeFileSync('public/models/Maps/Dust2/dust2_largo_cs2.json', JSON.stringify(mapData));
fs.writeFileSync('public/models/Maps/Dust2/dust2_largo_csgo.json', JSON.stringify(mapData));
console.log('[CS2 Map Builder] Successfully generated dust2_largo_cs2.json and dust2_largo_csgo.json!');
