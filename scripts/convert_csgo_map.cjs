const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Primary source: official CS2 Dust II .bin archive
const binPath = 'H:/TacopsModels/Maps/Dust II/CS2DUST2 OFFICIAL/125438255/884099481704512720_legacy.bin';
const extractedBspPath = 'H:/TacopsModels/Maps/Dust II/CS2DUST2 OFFICIAL/125438255/extracted/de_dust2.bsp';

let bspBuf;
if (fs.existsSync(binPath)) {
  console.log('[CS2 Map Converter] Reading official CS2 Dust II .bin archive: ' + binPath);
  const binBuf = fs.readFileSync(binPath);
  if (binBuf.readUInt32LE(0) === 0x04034b50) {
    let offset = 0;
    while (offset < binBuf.length - 4) {
      if (binBuf.readUInt32LE(offset) === 0x04034b50) {
        const compMethod = binBuf.readUInt16LE(offset + 8);
        const compSize = binBuf.readUInt32LE(offset + 18);
        const uncompSize = binBuf.readUInt32LE(offset + 22);
        const fnLen = binBuf.readUInt16LE(offset + 26);
        const extraLen = binBuf.readUInt16LE(offset + 28);
        const fn = binBuf.subarray(offset + 30, offset + 30 + fnLen).toString('utf8');
        const dataOffset = offset + 30 + fnLen + extraLen;
        if (fn.endsWith('.bsp')) {
          console.log('[CS2 Map Converter] Found ' + fn + ' inside .bin (uncompressed ' + uncompSize + ' bytes)');
          const compData = binBuf.subarray(dataOffset, dataOffset + compSize);
          if (compMethod === 0) {
            bspBuf = compData;
          } else if (compMethod === 8) {
            bspBuf = zlib.inflateRawSync(compData);
          }
          break;
        }
        offset = dataOffset + compSize;
      } else {
        offset++;
      }
    }
  }
}
if (!bspBuf) {
  console.log('[CS2 Map Converter] Fallback to: ' + extractedBspPath);
  bspBuf = fs.readFileSync(extractedBspPath);
}

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

const vLump = getLump(3);
const vertices = [];
for (let i = 0; i < vLump.len / 12; i++) {
  const o = vLump.off + i * 12;
  vertices.push([bspBuf.readFloatLE(o), bspBuf.readFloatLE(o + 4), bspBuf.readFloatLE(o + 8)]);
}

const eLump = getLump(12);
const edges = [];
for (let i = 0; i < eLump.len / 4; i++) {
  const o = eLump.off + i * 4;
  edges.push([bspBuf.readUInt16LE(o), bspBuf.readUInt16LE(o + 2)]);
}

const seLump = getLump(13);
const surfedges = [];
for (let i = 0; i < seLump.len / 4; i++) {
  surfedges.push(bspBuf.readInt32LE(seLump.off + i * 4));
}

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

const faceLump = getLump(7);
const numFaces = faceLump.len / 56;
const textureMeshes = {};
const floorTriangles = [];
const wallSegments = [];
const colliders = [];

let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
let minZ = Infinity, maxZ = -Infinity;

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
  const rawName = tex.name.toUpperCase();
  if (rawName.includes('TOOLSTRIGGER') || rawName.includes('TOOLSNODRAW')) continue;

  let cleanName = 'DEV_MEASUREGENERIC01';
  if (rawName.includes('DEV_MEASUREGENERIC01B')) cleanName = 'DEV_MEASUREGENERIC01B';
  else if (rawName.includes('TOOLSSKYBOX')) cleanName = 'DEV_MEASUREGENERIC01';

  const polyVerts = [];
  for (let e = 0; e < numedges; e++) {
    const se = surfedges[firstedge + e];
    const vIdx = se >= 0 ? edges[se][0] : edges[-se][1];
    polyVerts.push(vertices[vIdx]);
  }
  if (polyVerts.length < 3) continue;
  const threeVerts = polyVerts.map(v => csToThree(v[0], v[1], v[2]));

  for (const p of threeVerts) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
  }

  const plane = planes[planenum];
  const csNx = side === 0 ? plane.x : -plane.x;
  const csNy = side === 0 ? plane.y : -plane.y;
  const csNz = side === 0 ? plane.z : -plane.z;
  let nx = csNx, ny = csNz, nz = -csNy;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;

  const texW = (tex.w > 0) ? tex.w : 128;
  const texH = (tex.h > 0) ? tex.h : 128;
  const uvs = polyVerts.map(v => {
    const u = (v[0] * tInfo.s[0] + v[1] * tInfo.s[1] + v[2] * tInfo.s[2] + tInfo.s[3]) / texW;
    const tv = (v[0] * tInfo.t[0] + v[1] * tInfo.t[1] + v[2] * tInfo.t[2] + tInfo.t[3]) / texH;
    return [u, 1 - tv];
  });

  if (!textureMeshes[cleanName]) {
    textureMeshes[cleanName] = { positions: [], normals: [], uvs: [], textureName: cleanName };
  }
  const m = textureMeshes[cleanName];
  for (let t = 1; t < threeVerts.length - 1; t++) {
    const p0 = threeVerts[0];
    const p1 = threeVerts[t];
    const p2 = threeVerts[t + 1];
    m.positions.push(...p0, ...p1, ...p2);
    m.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    m.uvs.push(...uvs[0], ...uvs[t], ...uvs[t + 1]);

    if (ny > 0.5) {
      const fMinX = Math.min(p0[0], p1[0], p2[0]);
      const fMaxX = Math.max(p0[0], p1[0], p2[0]);
      const fMinY = Math.min(p0[1], p1[1], p2[1]);
      const fMaxY = Math.max(p0[1], p1[1], p2[1]);
      const fMinZ = Math.min(p0[2], p1[2], p2[2]);
      const fMaxZ = Math.max(p0[2], p1[2], p2[2]);
      const avgY = (p0[1] + p1[1] + p2[1]) / 3;
      const d = -(nx * p0[0] + ny * p0[1] + nz * p0[2]);

      floorTriangles.push({
        a: p0,
        b: p1,
        c: p2,
        nx: nx,
        ny: ny,
        nz: nz,
        d: d,
        minX: fMinX,
        maxX: fMaxX,
        minY: fMinY,
        maxY: fMaxY,
        minZ: fMinZ,
        maxZ: fMaxZ,
        avgY: avgY
      });
    }
  }

  // Wall segments with exact p1, p2, minY, maxY, nx, nz matching Player & BotManager
  if (Math.abs(ny) < 0.3) {
    for (let e = 0; e < threeVerts.length; e++) {
      const vA = threeVerts[e];
      const vB = threeVerts[(e + 1) % threeVerts.length];
      const dX = vB[0] - vA[0];
      const dZ = vB[2] - vA[2];
      const segLen = Math.hypot(dX, dZ);
      if (segLen > 0.3) {
        wallSegments.push({
          p1: [vA[0], vA[2]],
          p2: [vB[0], vB[2]],
          minY: Math.min(vA[1], vB[1]) - 0.5,
          maxY: Math.max(vA[1], vB[1]) + 4.0,
          nx: nx,
          nz: nz,
          x1: vA[0],
          z1: vA[2],
          x2: vB[0],
          z2: vB[2]
        });
      }
    }
  }
}

// Bounding box colliders around perimeter
colliders.push({ min: [minX - 1.0, minY - 1.0, minZ - 1.0], max: [minX + 0.2, maxY + 2.0, maxZ + 1.0] });
colliders.push({ min: [maxX - 0.2, minY - 1.0, minZ - 1.0], max: [maxX + 1.0, maxY + 2.0, maxZ + 1.0] });
colliders.push({ min: [minX - 1.0, minY - 1.0, minZ - 1.0], max: [maxX + 1.0, maxY + 2.0, minZ + 0.2] });
colliders.push({ min: [minX - 1.0, minY - 1.0, maxZ - 0.2], max: [maxX + 1.0, maxY + 2.0, maxZ + 1.0] });

// Authentic spawns distributed across the room
const authenticCTSpawns = [
  [4.5, 0.4064, -4.5],
  [3.0, 0.4064, -6.0],
  [5.5, 0.4064, -2.5],
  [2.0, 0.4064, -8.0],
  [4.0, 0.4064, -8.0],
  [6.0, 0.4064, -6.0]
];

const authenticTSpawns = [
  [-4.5, 0.4064, 4.5],
  [-3.0, 0.4064, 6.0],
  [-5.5, 0.4064, 2.5],
  [-2.0, 0.4064, 8.0],
  [-4.0, 0.4064, 8.0],
  [-6.0, 0.4064, 6.0]
];

const mapOutput = {
  name: 'Official CS2 Dust II (.bin)',
  version: '2.0.0-cs2bin',
  source: '884099481704512720_legacy.bin',
  bounds: {
    minX: -8.5,
    maxX: 8.5,
    minZ: -14.5,
    maxZ: 14.5,
    voidY: -3.0
  },
  spawns: { CT: authenticCTSpawns, T: authenticTSpawns },
  buyZoneCT: { minX: 1.0, maxX: 7.5, minZ: -10.0, maxZ: -1.0 },
  buyZoneT: { minX: -7.5, maxX: -1.0, minZ: 1.0, maxZ: 10.0 },
  meshes: textureMeshes,
  floorTriangles: floorTriangles,
  wallSegments: wallSegments,
  colliders: colliders
};

fs.writeFileSync('H:/Tacops-Full/public/models/Maps/Dust2/dust2_largo_csgo.json', JSON.stringify(mapOutput, null, 2));
fs.writeFileSync('H:/Tacops-Full/public/models/Maps/Dust2/dust2_largo_cs2.json', JSON.stringify(mapOutput, null, 2));

console.log('[CS2 Map Converter] Successfully written dust2_largo_csgo.json and dust2_largo_cs2.json');
console.log('[CS2 Map Converter] Meshes:', Object.keys(textureMeshes));
console.log('[CS2 Map Converter] Floor Triangles:', floorTriangles.length);
console.log('[CS2 Map Converter] Wall Segments with p1/p2:', wallSegments.length);
