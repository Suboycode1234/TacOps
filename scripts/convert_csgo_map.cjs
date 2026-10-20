const fs = require('fs');
const path = require('path');

const bspPath = 'H:/TacopsModels/Maps/Dust II/de_dust2_largo-master/csgo/maps/de_dust2_largo.bsp';
const bspBuf = fs.readFileSync(bspPath);

function getLump(id) {
  return {
    off: bspBuf.readInt32LE(8 + id * 16),
    len: bspBuf.readInt32LE(12 + id * 16)
  };
}

const SCALE = 0.0254;
function csToThree(csX, csY, csZ) {
  return [csX * SCALE, csZ * SCALE, -csY * SCALE];
}

// Lump 0: Entities
const entLump = getLump(0);
const entsStr = bspBuf.toString('latin1', entLump.off, entLump.off + entLump.len);

const ctSpawns = [];
const tSpawns = [];
const entBlocks = entsStr.split('{');
for (const b of entBlocks) {
  const classMatch = b.match(/"classname"\s+"([^"]+)"/);
  const originMatch = b.match(/"origin"\s+"([^"]+)"/);
  if (classMatch && originMatch) {
    const cls = classMatch[1];
    const [x, y, z] = originMatch[1].trim().split(/\s+/).map(Number);
    if (cls === 'info_player_counterterrorist' || cls === 'info_player_start') {
      ctSpawns.push(csToThree(x, y, z));
    } else if (cls === 'info_player_terrorist' || cls === 'info_player_deathmatch') {
      tSpawns.push(csToThree(x, y, z));
    }
  }
}

// Lump 3: Vertices
const vLump = getLump(3);
const vertices = [];
for (let i = 0; i < vLump.len / 12; i++) {
  const o = vLump.off + i * 12;
  vertices.push([bspBuf.readFloatLE(o), bspBuf.readFloatLE(o + 4), bspBuf.readFloatLE(o + 8)]);
}

// Lump 12: Edges
const eLump = getLump(12);
const edges = [];
for (let i = 0; i < eLump.len / 4; i++) {
  const o = eLump.off + i * 4;
  edges.push([bspBuf.readUInt16LE(o), bspBuf.readUInt16LE(o + 2)]);
}

// Lump 13: Surfedges
const seLump = getLump(13);
const surfedges = [];
for (let i = 0; i < seLump.len / 4; i++) {
  surfedges.push(bspBuf.readInt32LE(seLump.off + i * 4));
}

// Lump 1: Planes
const pLump = getLump(1);
const planes = [];
for (let i = 0; i < pLump.len / 20; i++) {
  const o = pLump.off + i * 20;
  planes.push({
    x: bspBuf.readFloatLE(o),
    y: bspBuf.readFloatLE(o + 4),
    z: bspBuf.readFloatLE(o + 8),
    dist: bspBuf.readFloatLE(o + 12)
  });
}

// Lump 44: String Table, Lump 43: String Data, Lump 2: TexData
const strTableLump = getLump(44);
const strDataLump = getLump(43);
const texDataLump = getLump(2);
const texNames = [];
for (let i = 0; i < texDataLump.len / 32; i++) {
  const o = texDataLump.off + i * 32;
  const strId = bspBuf.readInt32LE(o + 12);
  const w = bspBuf.readInt32LE(o + 16);
  const h = bspBuf.readInt32LE(o + 20);
  const strOff = strDataLump.off + bspBuf.readInt32LE(strTableLump.off + strId * 4);
  const name = bspBuf.toString('ascii', strOff, strOff + 64).replace(/\0.*$/, '');
  texNames.push({ name, w, h });
}

// Lump 6: TexInfo
const texInfoLump = getLump(6);
const texInfos = [];
for (let i = 0; i < texInfoLump.len / 72; i++) {
  const o = texInfoLump.off + i * 72;
  texInfos.push({
    s: [bspBuf.readFloatLE(o), bspBuf.readFloatLE(o + 4), bspBuf.readFloatLE(o + 8), bspBuf.readFloatLE(o + 12)],
    t: [bspBuf.readFloatLE(o + 16), bspBuf.readFloatLE(o + 20), bspBuf.readFloatLE(o + 24), bspBuf.readFloatLE(o + 28)],
    flags: bspBuf.readInt32LE(o + 64),
    texdata: bspBuf.readInt32LE(o + 68)
  });
}

// Lump 7: Faces
const faceLump = getLump(7);
const numFaces = faceLump.len / 56;

const textureMeshes = {};
const floorTriangles = [];
const rawColliders = [];
const wallSegments = [];

for (let i = 0; i < numFaces; i++) {
  const o = faceLump.off + i * 56;
  const planenum = bspBuf.readUInt16LE(o);
  const side = bspBuf.readUInt8(o + 2);
  const firstedge = bspBuf.readInt32LE(o + 4);
  const numedges = bspBuf.readInt16LE(o + 8);
  const texinfo = bspBuf.readInt16LE(o + 10);

  if (texinfo < 0 || texinfo >= texInfos.length) continue;
  const tInfo = texInfos[texinfo];
  const tex = texNames[tInfo.texdata];
  if (!tex) continue;

  const rawTexName = tex.name;
  if (rawTexName.toUpperCase().includes('TOOLSSKYBOX') ||
      rawTexName.toUpperCase().includes('TOOLSTRIGGER') ||
      rawTexName.toUpperCase().includes('TOOLSNODRAW') ||
      rawTexName.toUpperCase().includes('TOOLSINVISIBLE') ||
      rawTexName.toUpperCase().includes('TOOLSKIP') ||
      rawTexName.toUpperCase().includes('TOOLSHINT')) {
    continue;
  }

  // Normalize texture key to match local textures
  const texBase = path.basename(rawTexName);
  let cleanTexKey = texBase;
  const existingFiles = fs.readdirSync('H:/Tacops-Full/public/models/Maps/Dust2/textures');
  const matched = existingFiles.find(f => f.toLowerCase() === (texBase.toLowerCase() + '.png'));
  if (matched) {
    cleanTexKey = matched.replace(/\.png$/i, '');
  }

  const polyVerts = [];
  for (let e = 0; e < numedges; e++) {
    const se = surfedges[firstedge + e];
    const vIdx = se >= 0 ? edges[se][0] : edges[-se][1];
    polyVerts.push(vertices[vIdx]);
  }

  if (polyVerts.length < 3) continue;

  const plane = planes[planenum];
  const csNx = side === 0 ? plane.x : -plane.x;
  const csNy = side === 0 ? plane.y : -plane.y;
  const csNz = side === 0 ? plane.z : -plane.z;

  let nx = csNx;
  let ny = csNz;
  let nz = -csNy;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;

  const texW = (tex.w > 0) ? tex.w : 128;
  const texH = (tex.h > 0) ? tex.h : 128;

  const threeVerts = polyVerts.map(v => csToThree(v[0], v[1], v[2]));
  const uvs = polyVerts.map(v => {
    const u = (v[0] * tInfo.s[0] + v[1] * tInfo.s[1] + v[2] * tInfo.s[2] + tInfo.s[3]) / texW;
    const tv = (v[0] * tInfo.t[0] + v[1] * tInfo.t[1] + v[2] * tInfo.t[2] + tInfo.t[3]) / texH;
    return [u, 1 - tv];
  });

  if (!textureMeshes[cleanTexKey]) {
    textureMeshes[cleanTexKey] = {
      positions: [],
      normals: [],
      uvs: []
    };
  }
  const meshData = textureMeshes[cleanTexKey];

  for (let v = 1; v < threeVerts.length - 1; v++) {
    const pA = threeVerts[0];
    const pB = threeVerts[v];
    const pC = threeVerts[v + 1];

    meshData.positions.push(...pA, ...pB, ...pC);
    meshData.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    meshData.uvs.push(...uvs[0], ...uvs[v], ...uvs[v + 1]);

    if (csNz > 0.15) {
      const minX = Math.min(pA[0], pB[0], pC[0]);
      const maxX = Math.max(pA[0], pB[0], pC[0]);
      const minZ = Math.min(pA[2], pB[2], pC[2]);
      const maxZ = Math.max(pA[2], pB[2], pC[2]);
      const minY = Math.min(pA[1], pB[1], pC[1]);
      const maxY = Math.max(pA[1], pB[1], pC[1]);
      const d = -(nx * pA[0] + ny * pA[1] + nz * pA[2]);

      floorTriangles.push({
        a: pA,
        b: pB,
        c: pC,
        nx, ny, nz, d,
        minX, maxX, minZ, maxZ, minY, maxY,
        avgY: (pA[1] + pB[1] + pC[1]) / 3
      });
    }
  }

  // Wall colliders & segments (|csNz| <= 0.25 => vertical wall)
  if (Math.abs(csNz) <= 0.25) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const v of threeVerts) {
      if (v[0] < minX) minX = v[0];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[1] > maxY) maxY = v[1];
      if (v[2] < minZ) minZ = v[2];
      if (v[2] > maxZ) maxZ = v[2];
    }

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;

    if (sizeY > 0.5 && (sizeX > 0.3 || sizeZ > 0.3)) {
      rawColliders.push({
        min: [
          Number((minX - (sizeX < 0.2 ? 0.1 : 0)).toFixed(3)),
          Number(minY.toFixed(3)),
          Number((minZ - (sizeZ < 0.2 ? 0.1 : 0)).toFixed(3))
        ],
        max: [
          Number((maxX + (sizeX < 0.2 ? 0.1 : 0)).toFixed(3)),
          Number(maxY.toFixed(3)),
          Number((maxZ + (sizeZ < 0.2 ? 0.1 : 0)).toFixed(3))
        ]
      });
    }

    // 2D wall segment
    let bestDist = -1;
    let p1 = threeVerts[0], p2 = threeVerts[1];
    for (let j = 0; j < threeVerts.length; j++) {
      for (let k = j + 1; k < threeVerts.length; k++) {
        const dx = threeVerts[j][0] - threeVerts[k][0];
        const dz = threeVerts[j][2] - threeVerts[k][2];
        const dist = dx * dx + dz * dz;
        if (dist > bestDist) {
          bestDist = dist;
          p1 = threeVerts[j];
          p2 = threeVerts[k];
        }
      }
    }

    const nLen = Math.hypot(nx, nz) || 1;
    wallSegments.push({
      p1: [Number(p1[0].toFixed(3)), Number(p1[2].toFixed(3))],
      p2: [Number(p2[0].toFixed(3)), Number(p2[2].toFixed(3))],
      minY: Number(minY.toFixed(3)),
      maxY: Number(maxY.toFixed(3)),
      nx: Number((nx / nLen).toFixed(3)),
      nz: Number((nz / nLen).toFixed(3))
    });
  }
}

// Deduplicate colliders
const uniqueMap = new Map();
for (const c of rawColliders) {
  const key = `${c.min[0]}_${c.min[1]}_${c.min[2]}_${c.max[0]}_${c.max[1]}_${c.max[2]}`;
  if (!uniqueMap.has(key)) uniqueMap.set(key, c);
}
const colliders = [...uniqueMap.values()];

const outMap = {
  name: 'de_dust2_largo_csgo',
  spawns: {
    CT: ctSpawns,
    T: tSpawns
  },
  meshes: textureMeshes,
  colliders,
  wallSegments,
  floorTriangles
};

const outPath = 'H:/Tacops-Full/public/models/Maps/Dust2/dust2_largo_csgo.json';
fs.writeFileSync(outPath, JSON.stringify(outMap));
console.log(`Updated CSGO map JSON: ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`CT Spawns: ${ctSpawns.length}, T Spawns: ${tSpawns.length}`);
console.log(`Meshes: ${Object.keys(textureMeshes).length}, Colliders: ${colliders.length}, WallSegments: ${wallSegments.length}, Floors: ${floorTriangles.length}`);
