import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// --- PNG ENCODER ---
function makePng(width, height, rgba) {
  const rowLen = width * 4;
  const raw = Buffer.alloc(height * (rowLen + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowLen + 1)] = 0;
    rgba.copy(raw, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
    table[i] = c;
  }
  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  function chunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', compressed);
  const iendChunk = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// --- DXT1 DECODER ---
function decodeRGB565(val) {
  const r = Math.round(((val >> 11) & 0x1F) * 255 / 31);
  const g = Math.round(((val >> 5) & 0x3F) * 255 / 63);
  const b = Math.round((val & 0x1F) * 255 / 31);
  return [r, g, b, 255];
}

function decodeDXT1(buf, width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  let srcOffset = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      if (srcOffset + 8 > buf.length) break;
      const c0 = buf.readUInt16LE(srcOffset);
      const c1 = buf.readUInt16LE(srcOffset + 2);
      const bits = buf.readUInt32LE(srcOffset + 4);
      srcOffset += 8;

      const rgb0 = decodeRGB565(c0);
      const rgb1 = decodeRGB565(c1);
      const colors = [rgb0, rgb1];

      if (c0 > c1) {
        colors.push([
          Math.round((2 * rgb0[0] + rgb1[0]) / 3),
          Math.round((2 * rgb0[1] + rgb1[1]) / 3),
          Math.round((2 * rgb0[2] + rgb1[2]) / 3),
          255
        ]);
        colors.push([
          Math.round((rgb0[0] + 2 * rgb1[0]) / 3),
          Math.round((rgb0[1] + 2 * rgb1[1]) / 3),
          Math.round((rgb0[2] + 2 * rgb1[2]) / 3),
          255
        ]);
      } else {
        colors.push([
          Math.round((rgb0[0] + rgb1[0]) / 2),
          Math.round((rgb0[1] + rgb1[1]) / 2),
          Math.round((rgb0[2] + rgb1[2]) / 2),
          255
        ]);
        colors.push([0, 0, 0, 0]);
      }

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelX = bx * 4 + px;
          const pixelY = by * 4 + py;
          if (pixelX < width && pixelY < height) {
            const shift = (py * 4 + px) * 2;
            const code = (bits >> shift) & 0x03;
            const c = colors[code];
            const dstIdx = (pixelY * width + pixelX) * 4;
            rgba[dstIdx] = c[0];
            rgba[dstIdx + 1] = c[1];
            rgba[dstIdx + 2] = c[2];
            rgba[dstIdx + 3] = c[3];
          }
        }
      }
    }
  }
  return rgba;
}

// --- DXT5 DECODER ---
function decodeDXT5(buf, width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  let srcOffset = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      if (srcOffset + 16 > buf.length) break;
      const a0 = buf.readUInt8(srcOffset);
      const a1 = buf.readUInt8(srcOffset + 1);
      const aIndicesBuf = buf.subarray(srcOffset + 2, srcOffset + 8);

      const alphas = [a0, a1];
      if (a0 > a1) {
        alphas.push(Math.round((6 * a0 + 1 * a1) / 7));
        alphas.push(Math.round((5 * a0 + 2 * a1) / 7));
        alphas.push(Math.round((4 * a0 + 3 * a1) / 7));
        alphas.push(Math.round((3 * a0 + 4 * a1) / 7));
        alphas.push(Math.round((2 * a0 + 5 * a1) / 7));
        alphas.push(Math.round((1 * a0 + 6 * a1) / 7));
      } else {
        alphas.push(Math.round((4 * a0 + 1 * a1) / 5));
        alphas.push(Math.round((3 * a0 + 2 * a1) / 5));
        alphas.push(Math.round((2 * a0 + 3 * a1) / 5));
        alphas.push(Math.round((1 * a0 + 4 * a1) / 5));
        alphas.push(0);
        alphas.push(255);
      }

      let aBits = 0n;
      for (let i = 0; i < 6; i++) {
        aBits |= (BigInt(aIndicesBuf[i]) << BigInt(i * 8));
      }

      const c0 = buf.readUInt16LE(srcOffset + 8);
      const c1 = buf.readUInt16LE(srcOffset + 10);
      const cBits = buf.readUInt32LE(srcOffset + 12);
      srcOffset += 16;

      const rgb0 = decodeRGB565(c0);
      const rgb1 = decodeRGB565(c1);
      const colors = [
        rgb0,
        rgb1,
        [Math.round((2 * rgb0[0] + rgb1[0]) / 3), Math.round((2 * rgb0[1] + rgb1[1]) / 3), Math.round((2 * rgb0[2] + rgb1[2]) / 3), 255],
        [Math.round((rgb0[0] + 2 * rgb1[0]) / 3), Math.round((rgb0[1] + 2 * rgb1[1]) / 3), Math.round((rgb0[2] + 2 * rgb1[2]) / 3), 255]
      ];

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelX = bx * 4 + px;
          const pixelY = by * 4 + py;
          if (pixelX < width && pixelY < height) {
            const pixelNum = py * 4 + px;
            const cCode = (cBits >> (pixelNum * 2)) & 0x03;
            const aCode = Number((aBits >> BigInt(pixelNum * 3)) & 0x07n);
            const c = colors[cCode];
            const a = alphas[aCode];
            const dstIdx = (pixelY * width + pixelX) * 4;
            rgba[dstIdx] = c[0];
            rgba[dstIdx + 1] = c[1];
            rgba[dstIdx + 2] = c[2];
            rgba[dstIdx + 3] = a;
          }
        }
      }
    }
  }
  return rgba;
}

// Convert VTF files
const matDir = 'H:/TacopsModels/Maps/Dust II/de_dust2_largo-master/csgo/materials';
const outTexDir = 'public/models/Maps/Dust2/textures';
fs.mkdirSync(outTexDir, { recursive: true });

function getAllFiles(dir, ext) {
  let res = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) res.push(...getAllFiles(full, ext));
    else if (f.toLowerCase().endsWith(ext)) res.push(full);
  }
  return res;
}

const vtfFiles = getAllFiles(matDir, '.vtf');
for (const vtfPath of vtfFiles) {
  const baseName = path.basename(vtfPath, path.extname(vtfPath));
  const buf = fs.readFileSync(vtfPath);
  if (buf.toString('ascii', 0, 4) !== 'VTF\0') continue;

  const w = buf.readUInt16LE(16);
  const h = buf.readUInt16LE(18);
  const fmt = buf.readUInt32LE(52);

  let rgba;
  if (fmt === 13) {
    const size = Math.ceil(w / 4) * Math.ceil(h / 4) * 8;
    const dxtData = buf.subarray(buf.length - size);
    rgba = decodeDXT1(dxtData, w, h);
  } else if (fmt === 15) {
    const size = Math.ceil(w / 4) * Math.ceil(h / 4) * 16;
    const dxtData = buf.subarray(buf.length - size);
    rgba = decodeDXT5(dxtData, w, h);
  } else {
    continue;
  }

  const png = makePng(w, h, rgba);
  fs.writeFileSync(path.join(outTexDir, `${baseName}.png`), png);
}

// Skybox TGAs
const envDir = 'H:/TacopsModels/Maps/Dust II/de_dust2_largo-master/cs/gfx/env';
const outSkyDir = 'public/models/Maps/Dust2/skybox';
fs.mkdirSync(outSkyDir, { recursive: true });

const tgaFiles = fs.existsSync(envDir) ? fs.readdirSync(envDir).filter(f => f.endsWith('.tga')) : [];
for (const tga of tgaFiles) {
  const buf = fs.readFileSync(path.join(envDir, tga));
  const w = buf.readUInt16LE(12);
  const h = buf.readUInt16LE(14);
  const bpp = buf[16];
  const desc = buf[17];
  const isTopDown = (desc & 0x20) !== 0;
  const rgba = Buffer.alloc(w * h * 4);
  const bytesPerPixel = bpp / 8;
  const offset = 18 + buf[0];

  for (let y = 0; y < h; y++) {
    const srcY = isTopDown ? y : (h - 1 - y);
    for (let x = 0; x < w; x++) {
      const srcIdx = offset + (srcY * w + x) * bytesPerPixel;
      const dstIdx = (y * w + x) * 4;
      rgba[dstIdx] = buf[srcIdx + 2];
      rgba[dstIdx + 1] = buf[srcIdx + 1];
      rgba[dstIdx + 2] = buf[srcIdx];
      rgba[dstIdx + 3] = (bytesPerPixel === 4) ? buf[srcIdx + 3] : 255;
    }
  }

  const baseName = path.basename(tga, '.tga');
  const png = makePng(w, h, rgba);
  fs.writeFileSync(path.join(outSkyDir, `${baseName}.png`), png);
}

// Parse BSP
const bspPath = 'H:/TacopsModels/Maps/Dust II/de_dust2_largo-master/cs/maps/de_dust2_largo.bsp';
const bspBuf = fs.readFileSync(bspPath);

const lumps = [];
for (let i = 0; i < 15; i++) {
  lumps.push({ offset: bspBuf.readInt32LE(4 + i * 8), length: bspBuf.readInt32LE(8 + i * 8) });
}

// Vertices
const numVertices = lumps[3].length / 12;
const vertices = [];
for (let i = 0; i < numVertices; i++) {
  const o = lumps[3].offset + i * 12;
  vertices.push([bspBuf.readFloatLE(o), bspBuf.readFloatLE(o + 4), bspBuf.readFloatLE(o + 8)]);
}

// Edges
const numEdges = lumps[12].length / 4;
const edges = [];
for (let i = 0; i < numEdges; i++) {
  const o = lumps[12].offset + i * 4;
  edges.push([bspBuf.readUInt16LE(o), bspBuf.readUInt16LE(o + 2)]);
}

// Surfedges
const numSurfedges = lumps[13].length / 4;
const surfedges = [];
for (let i = 0; i < numSurfedges; i++) {
  surfedges.push(bspBuf.readInt32LE(lumps[13].offset + i * 4));
}

// Textures
const numMipTex = bspBuf.readInt32LE(lumps[2].offset);
const bspTextures = [];
for (let i = 0; i < numMipTex; i++) {
  const o = bspBuf.readInt32LE(lumps[2].offset + 4 + i * 4);
  if (o >= 0) {
    const to = lumps[2].offset + o;
    const name = bspBuf.toString('ascii', to, to + 16).replace(/\0.*$/, '');
    const w = bspBuf.readUInt32LE(to + 16);
    const h = bspBuf.readUInt32LE(to + 20);
    bspTextures.push({ name, w, h });
  } else {
    bspTextures.push({ name: 'empty', w: 16, h: 16 });
  }
}

// TexInfo
const numTexInfo = lumps[6].length / 40;
const texInfos = [];
for (let i = 0; i < numTexInfo; i++) {
  const o = lumps[6].offset + i * 40;
  texInfos.push({
    s: [bspBuf.readFloatLE(o), bspBuf.readFloatLE(o + 4), bspBuf.readFloatLE(o + 8), bspBuf.readFloatLE(o + 12)],
    t: [bspBuf.readFloatLE(o + 16), bspBuf.readFloatLE(o + 20), bspBuf.readFloatLE(o + 24), bspBuf.readFloatLE(o + 28)],
    miptex: bspBuf.readUInt32LE(o + 32),
    flags: bspBuf.readUInt32LE(o + 36)
  });
}

const SCALE = 0.0254;
function csToThree(csX, csY, csZ) {
  return [csX * SCALE, csZ * SCALE, -csY * SCALE];
}

// Planes (Lump 1)
const numPlanes = lumps[1].length / 20;
const bspPlanes = [];
for (let i = 0; i < numPlanes; i++) {
  const o = lumps[1].offset + i * 20;
  bspPlanes.push({
    x: bspBuf.readFloatLE(o),
    y: bspBuf.readFloatLE(o + 4),
    z: bspBuf.readFloatLE(o + 8)
  });
}

// Faces
const numFaces = lumps[7].length / 20;
const textureMeshes = {};
const floorTriangles = [];

for (let i = 0; i < numFaces; i++) {
  const o = lumps[7].offset + i * 20;
  const planeId = bspBuf.readInt16LE(o);
  const side = bspBuf.readInt16LE(o + 2);
  const firstEdge = bspBuf.readInt32LE(o + 4);
  const numEdgesInFace = bspBuf.readInt16LE(o + 8);
  const texInfoId = bspBuf.readInt16LE(o + 10);

  const tInfo = texInfos[texInfoId];
  const tex = bspTextures[tInfo.miptex];
  const texName = tex ? tex.name : 'default';

  if (texName.toUpperCase().startsWith('CLIP')) continue;
  if (texName.toLowerCase() === 'sky') continue; // Let skybox shine through

  const polyVerts = [];
  for (let e = 0; e < numEdgesInFace; e++) {
    const se = surfedges[firstEdge + e];
    const vIdx = se >= 0 ? edges[se][0] : edges[-se][1];
    polyVerts.push(vertices[vIdx]);
  }

  if (polyVerts.length < 3) continue;

  if (!textureMeshes[texName]) {
    textureMeshes[texName] = {
      textureName: texName,
      positions: [],
      uvs: [],
      normals: [],
      indices: []
    };
  }

  const meshData = textureMeshes[texName];
  const texW = (tex && tex.w > 0) ? tex.w : 128;
  const texH = (tex && tex.h > 0) ? tex.h : 128;

  // Exact normal from BSP Planes lump
  const pPlane = bspPlanes[planeId];
  const csNx = side === 0 ? pPlane.x : -pPlane.x;
  const csNy = side === 0 ? pPlane.y : -pPlane.y;
  const csNz = side === 0 ? pPlane.z : -pPlane.z;

  let nx = csNx;
  let ny = csNz;
  let nz = -csNy;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;

  for (let k = 1; k < polyVerts.length - 1; k++) {
    const vA = polyVerts[0];
    const vB = polyVerts[k];
    const vC = polyVerts[k + 1];

    const tA = csToThree(vA[0], vA[1], vA[2]);
    const tB = csToThree(vB[0], vB[1], vB[2]);
    const tC = csToThree(vC[0], vC[1], vC[2]);

    const uvA = [
      (vA[0] * tInfo.s[0] + vA[1] * tInfo.s[1] + vA[2] * tInfo.s[2] + tInfo.s[3]) / texW,
      (vA[0] * tInfo.t[0] + vA[1] * tInfo.t[1] + vA[2] * tInfo.t[2] + tInfo.t[3]) / texH
    ];
    const uvB = [
      (vB[0] * tInfo.s[0] + vB[1] * tInfo.s[1] + vB[2] * tInfo.s[2] + tInfo.s[3]) / texW,
      (vB[0] * tInfo.t[0] + vB[1] * tInfo.t[1] + vB[2] * tInfo.t[2] + tInfo.t[3]) / texH
    ];
    const uvC = [
      (vC[0] * tInfo.s[0] + vC[1] * tInfo.s[1] + vC[2] * tInfo.s[2] + tInfo.s[3]) / texW,
      (vC[0] * tInfo.t[0] + vC[1] * tInfo.t[1] + vC[2] * tInfo.t[2] + tInfo.t[3]) / texH
    ];

    const baseIdx = meshData.positions.length / 3;
    meshData.positions.push(...tA, ...tB, ...tC);
    meshData.uvs.push(uvA[0], 1 - uvA[1], uvB[0], 1 - uvB[1], uvC[0], 1 - uvC[1]);
    meshData.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    meshData.indices.push(baseIdx, baseIdx + 1, baseIdx + 2);

    // Floor & Ramp triangle check (authentic upward normal: ny > 0.15)
    if (ny > 0.15) {
      floorTriangles.push({
        a: tA, b: tB, c: tC,
        nx, ny, nz,
        d: -(nx * tA[0] + ny * tA[1] + nz * tA[2]),
        minX: Math.min(tA[0], tB[0], tC[0]),
        maxX: Math.max(tA[0], tB[0], tC[0]),
        minZ: Math.min(tA[2], tB[2], tC[2]),
        maxZ: Math.max(tA[2], tB[2], tC[2]),
        minY: Math.min(tA[1], tB[1], tC[1]),
        maxY: Math.max(tA[1], tB[1], tC[1]),
        avgY: (tA[1] + tB[1] + tC[1]) / 3
      });
    }
  }
}

// Extract authentic wall colliders from BSP vertical faces (|csNz| <= 0.25)
const rawColliders = [];
for (let i = 0; i < numFaces; i++) {
  const o = lumps[7].offset + i * 20;
  const planeId = bspBuf.readInt16LE(o);
  const side = bspBuf.readInt16LE(o + 2);
  const firstEdge = bspBuf.readInt32LE(o + 4);
  const numEdgesInFace = bspBuf.readInt16LE(o + 8);

  const pPlane = bspPlanes[planeId];
  const csNz = side === 0 ? pPlane.z : -pPlane.z;

  // Only consider vertical or nearly vertical surfaces (walls, crates, obstacles)
  // Ramp surfaces and floors (csNz > 0.15) are strictly handled by floorTriangles
  if (Math.abs(csNz) > 0.25) continue;

  const polyVerts = [];
  for (let e = 0; e < numEdgesInFace; e++) {
    const se = surfedges[firstEdge + e];
    const vIdx = se >= 0 ? edges[se][0] : edges[-se][1];
    polyVerts.push(vertices[vIdx]);
  }
  if (polyVerts.length < 3) continue;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const v of polyVerts) {
    const [x, y, z] = csToThree(v[0], v[1], v[2]);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  // Filter out tiny step slivers (< 0.45m height)
  if (maxY - minY > 0.45 && (maxX - minX > 0.1 || maxZ - minZ > 0.1)) {
    const thick = 0.20;
    let cMinX = minX, cMaxX = maxX;
    let cMinZ = minZ, cMaxZ = maxZ;
    if (cMaxX - cMinX < thick) {
      const midX = (cMinX + cMaxX) / 2;
      cMinX = midX - thick / 2;
      cMaxX = midX + thick / 2;
    }
    if (cMaxZ - cMinZ < thick) {
      const midZ = (cMinZ + cMaxZ) / 2;
      cMinZ = midZ - thick / 2;
      cMaxZ = midZ + thick / 2;
    }

    rawColliders.push({
      min: [Number(cMinX.toFixed(3)), Number(minY.toFixed(3)), Number(cMinZ.toFixed(3))],
      max: [Number(cMaxX.toFixed(3)), Number(maxY.toFixed(3)), Number(cMaxZ.toFixed(3))]
    });
  }
}

// Deduplicate identical boxes
const uniqueMap = new Map();
for (const c of rawColliders) {
  const key = c.min.join(',') + '|' + c.max.join(',');
  if (!uniqueMap.has(key)) {
    uniqueMap.set(key, c);
  }
}
const colliders = [...uniqueMap.values()];

// Extract authentic 2D wall segments with exact outward normals from BSP vertical faces (|csNz| <= 0.25)
const wallSegments = [];
for (let i = 0; i < numFaces; i++) {
  const o = lumps[7].offset + i * 20;
  const planeId = bspBuf.readInt16LE(o);
  const side = bspBuf.readInt16LE(o + 2);
  const firstEdge = bspBuf.readInt32LE(o + 4);
  const numEdgesInFace = bspBuf.readInt16LE(o + 8);

  const pPlane = bspPlanes[planeId];
  const csNx = side === 0 ? pPlane.x : -pPlane.x;
  const csNy = side === 0 ? pPlane.y : -pPlane.y;
  const csNz = side === 0 ? pPlane.z : -pPlane.z;

  if (Math.abs(csNz) > 0.25) continue; // vertical walls only

  const polyVerts = [];
  for (let e = 0; e < numEdgesInFace; e++) {
    const se = surfedges[firstEdge + e];
    const vIdx = se >= 0 ? edges[se][0] : edges[-se][1];
    polyVerts.push(vertices[vIdx]);
  }
  if (polyVerts.length < 3) continue;

  const tVerts = polyVerts.map(v => csToThree(v[0], v[1], v[2]));
  const minY = Math.min(...tVerts.map(v => v[1]));
  const maxY = Math.max(...tVerts.map(v => v[1]));

  if (maxY - minY < 0.45) continue; // ignore tiny step risers

  // Find the two furthest vertices horizontally in (X, Z)
  let maxD2 = 0;
  let p1 = tVerts[0], p2 = tVerts[1];
  for (let j = 0; j < tVerts.length; j++) {
    for (let k = j + 1; k < tVerts.length; k++) {
      const d2 = (tVerts[j][0] - tVerts[k][0])**2 + (tVerts[j][2] - tVerts[k][2])**2;
      if (d2 > maxD2) {
        maxD2 = d2;
        p1 = tVerts[j];
        p2 = tVerts[k];
      }
    }
  }

  if (maxD2 < 0.04) continue; // less than 20cm wide

  const nx = csNx;
  const nz = -csNy;
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

// Spawns
const entsStr = bspBuf.toString('latin1', lumps[0].offset, lumps[0].offset + lumps[0].length);
const ctSpawns = [...entsStr.matchAll(/"classname"\s+"info_player_start"[\s\S]*?"origin"\s+"([^"]+)"/g)].map(m => {
  const [x, y, z] = m[1].trim().split(/\s+/).map(Number);
  return csToThree(x, y, z);
});

const tSpawns = [...entsStr.matchAll(/"classname"\s+"info_player_deathmatch"[\s\S]*?"origin"\s+"([^"]+)"/g)].map(m => {
  const [x, y, z] = m[1].trim().split(/\s+/).map(Number);
  return csToThree(x, y, z);
});

const mapData = {
  name: 'de_dust2_largo',
  spawns: {
    CT: ctSpawns,
    T: tSpawns
  },
  meshes: textureMeshes,
  colliders,
  wallSegments,
  floorTriangles
};

const outMapPath = 'public/models/Maps/Dust2/dust2_largo.json';
fs.writeFileSync(outMapPath, JSON.stringify(mapData));
console.log(`Generated map JSON: ${outMapPath} (${(fs.statSync(outMapPath).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`CT Spawns: ${ctSpawns.length}, T Spawns: ${tSpawns.length}`);
console.log(`Meshes: ${Object.keys(textureMeshes).length}, Colliders: ${colliders.length}, Floors: ${floorTriangles.length}`);
