import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const bspPath = 'H:/TacopsModels/Maps/Dust II/de_dust2_largo-master/cs/maps/de_dust2_largo.bsp';
const buf = fs.readFileSync(bspPath);

const lumps = [];
for (let i = 0; i < 15; i++) {
  lumps.push({ offset: buf.readInt32LE(4 + i * 8), length: buf.readInt32LE(8 + i * 8) });
}

console.log('BSP Version:', buf.readInt32LE(0));
console.log('Vertices count:', lumps[3].length / 12);
console.log('Edges count:', lumps[12].length / 4);
console.log('Surfedges count:', lumps[13].length / 4);
console.log('TexInfo count (stride 40):', lumps[6].length / 40);
console.log('Faces count (stride 20):', lumps[7].length / 20);

// Entities
const entsStr = buf.toString('latin1', lumps[0].offset, lumps[0].offset + lumps[0].length);
const matches = [...entsStr.matchAll(/"classname"\s+"([^"]+)"/g)].map(m => m[1]);
const counts = {};
for (const m of matches) counts[m] = (counts[m] || 0) + 1;
console.log('Entities:', counts);

// Spawns
const ctMatches = [...entsStr.matchAll(/"classname"\s+"info_player_start"[\s\S]*?"origin"\s+"([^"]+)"/g)].map(m => m[1]);
const tMatches = [...entsStr.matchAll(/"classname"\s+"info_player_deathmatch"[\s\S]*?"origin"\s+"([^"]+)"/g)].map(m => m[1]);
console.log('CT spawns (info_player_start):', ctMatches);
console.log('T spawns (info_player_deathmatch):', tMatches);
