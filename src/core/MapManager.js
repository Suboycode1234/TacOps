import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.wallSegments = [];
    this.floorTriangles = [];
    this.floorGrid = null;
    this.gridCellSize = 4.0;
    this.targets = [];
    this.textureCache = new Map();
    this.cs2TextureCache = new Map();

    // Default Spawns (authentic CS 1.6 de_dust2_largo coordinates)
    this.spawnPointsCT = [
      new THREE.Vector3(11.38, 2.44, -43.89),
      new THREE.Vector3(8.13, 2.44, -47.14),
      new THREE.Vector3(8.13, 2.44, -43.89),
      new THREE.Vector3(8.13, 2.44, -40.64),
      new THREE.Vector3(11.38, 2.44, -40.64),
      new THREE.Vector3(9.75, 2.44, -52.83),
    ];

    this.spawnPointsT = [
      new THREE.Vector3(-18.69, 3.25, 22.76),
      new THREE.Vector3(-21.13, 3.25, 22.76),
      new THREE.Vector3(-21.13, 3.25, 20.32),
      new THREE.Vector3(-18.69, 3.25, 20.32),
      new THREE.Vector3(-18.69, 3.25, 17.88),
      new THREE.Vector3(4.88, 3.25, 17.88),
    ];

    // Groups
    this.mapGroup = new THREE.Group();
    this.propsGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.scene.add(this.propsGroup);

    // Default CS 1.6 Boundaries & Buy Zones
    this.mapBounds = { minX: -23.5, maxX: 47.5, minZ: -80.0, maxZ: 26.5, voidY: -4.5 };
    this.buyZoneCT = { minX: 4, maxX: 16, minZ: -56, maxZ: -36 };
    this.buyZoneT = { minX: -26, maxX: 8, minZ: 14, maxZ: 28 };

    this.mapLoaded = false;
    this.onMapLoaded = null;

    this.initSkybox();
    this.initLighting();
  }

  initSkybox() {
    const cubeLoader = new THREE.CubeTextureLoader();
    cubeLoader.setPath('/models/Maps/Dust2/skybox/');
    try {
      this.skyboxTexture = cubeLoader.load(
        ['dust2_ft.png', 'dust2_bk.png', 'dust2_up.png', 'dust2_dn.png', 'dust2_rt.png', 'dust2_lf.png'],
        () => {
          if (this.currentMapId === 'cs16') {
            this.scene.background = this.skyboxTexture;
          }
        },
        undefined,
        () => {
          console.warn('Dust2 skybox cube texture missing, using atmospheric fallback gradient');
          if (this.currentMapId === 'cs16') {
            this.scene.background = new THREE.Color(0xd6be96);
          }
        }
      );
    } catch (e) {
      this.scene.background = new THREE.Color(0xd6be96);
    }
  }

  initLighting() {
    const hemiLight = new THREE.HemisphereLight(0xfff0dd, 0x555544, 0.75);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.25);
    sunLight.position.set(45, 60, -35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 250;

    const d = 60;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0003;
    this.scene.add(sunLight);
  }

  getTexture(textureName) {
    if (this.textureCache.has(textureName)) {
      return this.textureCache.get(textureName);
    }

    const loader = new THREE.TextureLoader();
    const cleanName = textureName.replace(/^CS_DUST\//i, '').replace(/^DE_DUST2\//i, '');
    const url = '/models/Maps/Dust2/textures/' + cleanName + '.png';

    const tex = loader.load(
      url,
      (loaded) => {
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.RepeatWrapping;
        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        console.warn('Texture ' + url + ' missing, applying sand fallback');
      }
    );

    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.textureCache.set(textureName, tex);
    return tex;
  }

  getCS2Texture(texFileName) {
    if (!texFileName) return null;
    if (this.cs2TextureCache.has(texFileName)) {
      return this.cs2TextureCache.get(texFileName);
    }
    const loader = new THREE.TextureLoader();
    const url = '/models/Maps/Dust2/textures_cs2/' + texFileName;
    const tex = loader.load(
      url,
      (loaded) => {
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.RepeatWrapping;
        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        console.warn('CS2 Texture ' + url + ' missing, applying fallback');
      }
    );
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.cs2TextureCache.set(texFileName, tex);
    return tex;
  }

  buildFloorGrid() {
    this.floorGrid = new Map();
    this.gridCellSize = 4.0;
    if (!this.floorTriangles || this.floorTriangles.length === 0) return;
    for (let i = 0; i < this.floorTriangles.length; i++) {
      const f = this.floorTriangles[i];
      const minCX = Math.floor(f.minX / this.gridCellSize);
      const maxCX = Math.floor(f.maxX / this.gridCellSize);
      const minCZ = Math.floor(f.minZ / this.gridCellSize);
      const maxCZ = Math.floor(f.maxZ / this.gridCellSize);
      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          const key = cx + ',' + cz;
          let list = this.floorGrid.get(key);
          if (!list) {
            list = [];
            this.floorGrid.set(key, list);
          }
          list.push(f);
        }
      }
    }
  }

  async loadMap(mapId = 'cs16') {
    this.currentMapId = mapId;
    this.mapLoaded = false;

    // 1. Dispose old terrain geometry and meshes recursively
    while (this.mapGroup.children.length > 0) {
      const child = this.mapGroup.children[0];
      this.mapGroup.remove(child);
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }

    // 2. Dispose old props and targets
    while (this.propsGroup.children.length > 0) {
      const child = this.propsGroup.children[0];
      this.propsGroup.remove(child);
      child.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }

    this.targets = [];
    this.colliders = [];
    this.wallSegments = [];
    this.floorTriangles = [];
    this.floorGrid = null;

    // Atmosphere & Skybox switching
    const isCS2 = mapId === 'cs2' || mapId === 'csgo';
    if (isCS2) {
      this.scene.background = new THREE.Color(0x6ca0dc); // Mediterranean CS2 clear daylight sky
      this.scene.fog = new THREE.FogExp2(0x6ca0dc, 0.001);
    } else {
      if (this.skyboxTexture) {
        this.scene.background = this.skyboxTexture;
      } else {
        this.scene.background = new THREE.Color(0xd6be96);
      }
      this.scene.fog = new THREE.FogExp2(0xd6be96, 0.0025);
    }

    const mapJsonUrl = isCS2
      ? '/models/Maps/Dust2/dust2_largo_cs2.json'
      : '/models/Maps/Dust2/dust2_largo.json';

    try {
      const res = await fetch(mapJsonUrl);
      if (!res.ok) throw new Error('HTTP error ' + res.status);
      const data = await res.json();

      // Set Map Bounds & Buy Zones
      if (data.bounds) {
        this.mapBounds = data.bounds;
      } else if (isCS2) {
        this.mapBounds = { minX: -36.4, maxX: 85.0, minZ: -60.0, maxZ: 56.0, voidY: -6.0 };
      } else {
        this.mapBounds = { minX: -23.5, maxX: 47.5, minZ: -80.0, maxZ: 26.5, voidY: -4.5 };
      }

      if (data.buyZoneCT) {
        this.buyZoneCT = data.buyZoneCT;
      } else if (isCS2) {
        this.buyZoneCT = { minX: 6.0, maxX: 18.0, minZ: -52.0, maxZ: -36.0 };
      } else {
        this.buyZoneCT = { minX: 4, maxX: 16, minZ: -56, maxZ: -36 };
      }

      if (data.buyZoneT) {
        this.buyZoneT = data.buyZoneT;
      } else if (isCS2) {
        this.buyZoneT = { minX: -26.0, maxX: -14.0, minZ: 5.0, maxZ: 25.0 };
      } else {
        this.buyZoneT = { minX: -26, maxX: 8, minZ: 14, maxZ: 28 };
      }

      // 1. Spawns
      if (data.spawns) {
        if (data.spawns.CT && data.spawns.CT.length > 0) {
          this.spawnPointsCT = data.spawns.CT.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        }
        if (data.spawns.T && data.spawns.T.length > 0) {
          this.spawnPointsT = data.spawns.T.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        }
      }

      // 2. Floor Triangles for Elevation Queries & Slope Walking
      if (data.floorTriangles) {
        this.floorTriangles = data.floorTriangles;
        this.buildFloorGrid();
      }

      // 3. Wall Segments for Circle-to-Line Continuous Collision
      if (data.wallSegments) {
        this.wallSegments = data.wallSegments;
      }

      // 4. Colliders for 3D Prop & Box Collision
      if (data.colliders) {
        for (const c of data.colliders) {
          const box = new THREE.Box3();
          if (c.min && c.max) {
            box.set(
              new THREE.Vector3(c.min[0], c.min[1], c.min[2]),
              new THREE.Vector3(c.max[0], c.max[1], c.max[2])
            );
          } else if (c.sx !== undefined) {
            box.set(
              new THREE.Vector3(c.x - c.sx / 2, c.y - c.sy / 2, c.z - c.sz / 2),
              new THREE.Vector3(c.x + c.sx / 2, c.y + c.sy / 2, c.z + c.sz / 2)
            );
          }
          this.colliders.push({ box });
        }
      }

      // 5. Construct 3D Visual Geometry
      if (data.glbUrl) {
        console.log('[MapManager] Loading official CS2 Source 2 visual world from: ' + data.glbUrl);
        const gltfLoader = new GLTFLoader();
        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.load(data.glbUrl, resolve, undefined, reject);
        });

        const textureMap = data.textureMap || {};
        const defaultMat = new THREE.MeshStandardMaterial({
          color: 0xdfcbaf,
          roughness: 0.85,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });

        gltf.scene.traverse((c) => {
          if (c.isMesh) {
            c.receiveShadow = true;
            c.castShadow = false;

            // Filter out blocklight shadow dummy meshes
            if (c.name.includes('blocklight') || c.name.includes('shadow')) {
              c.visible = false;
              return;
            }

            // Extract material tag from mesh name
            const m = c.name.match(/agg\d+_\d+_(.+?)(?:_\d+)?$/);
            const tag = m ? m[1].toLowerCase() : c.name.toLowerCase();
            const texFile = textureMap[tag];

            if (texFile) {
              const tex = this.getCS2Texture(texFile);
              c.material = new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.8,
                metalness: 0.05,
                side: THREE.DoubleSide,
              });
            } else {
              c.material = defaultMat;
            }
          }
        });

        this.mapGroup.add(gltf.scene);
      } else {
        // Construct from meshesData (CS 1.6 Classic)
        const meshesData = data.meshes || {};
        for (const [texKey, mData] of Object.entries(meshesData)) {
          if (!mData.positions || mData.positions.length === 0) continue;

          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(mData.positions, 3));
          if (mData.uvs && mData.uvs.length > 0) {
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(mData.uvs, 2));
          }
          if (mData.normals && mData.normals.length > 0) {
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(mData.normals, 3));
          } else {
            geo.computeVertexNormals();
          }
          if (mData.indices && mData.indices.length > 0) {
            geo.setIndex(mData.indices);
          }

          const texture = this.getTexture(mData.textureName || texKey);
          const isDevMeasure = texKey.includes('DEV_MEASUREGENERIC01');
          const fallbackColor = texKey.includes('01B') ? 0x484d54 : 0xdd7d28;
          const mat = new THREE.MeshStandardMaterial({
            map: texture,
            color: isDevMeasure ? fallbackColor : 0xffffff,
            roughness: 0.85,
            metalness: 0.05,
            side: THREE.DoubleSide,
          });

          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          mesh.name = 'Dust2_' + mapId + '_' + texKey;
          this.mapGroup.add(mesh);
        }
      }

      // 6. Tactical interactive shooting targets
      this.createShootingTargets();

      // 7. Buy zone visual decals
      this.createBuyZoneDecals();

      this.mapLoaded = true;
      console.log('[MapManager] ' + (isCS2 ? 'Counter-Strike 2 Official Map' : 'CS 1.6 Classic') + ' loaded: ' + this.floorTriangles.length + ' floors, ' + this.wallSegments.length + ' wall segments.');

      if (this.onMapLoaded) {
        this.onMapLoaded(mapId);
      }
    } catch (e) {
      console.error('Failed to load map ' + mapId + ', falling back to procedural ground:', e);
      this.createFallbackGround();
    }
  }

  // Backward compatible alias
  async loadDust2Map() {
    return this.loadMap(this.currentMapId || 'cs16');
  }

  createShootingTargets() {
    const isCS2 = this.currentMapId === 'cs2' || this.currentMapId === 'csgo';
    const targetPositions = isCS2
      ? [
          new THREE.Vector3(14, 0.5, -24), // Pit
          new THREE.Vector3(10, 1.5, -34), // A ramp
          new THREE.Vector3(6, 1.2, -6),   // Long corner
        ]
      : [
          new THREE.Vector3(14, 0.5, -24), // Pit
          new THREE.Vector3(10, 2.5, -34), // A ramp
          new THREE.Vector3(6, 2.2, -6),   // Long corner
        ];

    const targetMat = this.createBullseyeMaterial();

    targetPositions.forEach((pos) => {
      const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(pos.x, pos.y + 0.8, pos.z);
      this.propsGroup.add(pole);

      const targetGroup = new THREE.Group();
      targetGroup.position.set(pos.x, pos.y + 1.6, pos.z);

      const discGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.05, 24);
      const disc = new THREE.Mesh(discGeo, targetMat);
      disc.rotation.x = Math.PI / 2;
      disc.castShadow = true;
      disc.name = 'Target_Bullseye';
      targetGroup.add(disc);

      targetGroup.userData = {
        isTarget: true,
        hp: 1,
        hitCount: 0,
      };

      this.propsGroup.add(targetGroup);
      this.targets.push(targetGroup);
    });
  }

  createBullseyeMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(128, 128, 90, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e6091';
    ctx.beginPath();
    ctx.arc(128, 128, 60, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#c1121f';
    ctx.beginPath();
    ctx.arc(128, 128, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fdf0d5';
    ctx.beginPath();
    ctx.arc(128, 128, 10, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  }

  createBuyZoneDecals() {
    const isCS2 = this.currentMapId === 'cs2' || this.currentMapId === 'csgo';
    const ctPos = isCS2 ? new THREE.Vector3(12.5, 0.3, -44.0) : new THREE.Vector3(10.0, 2.46, -44.0);
    const tPos = isCS2 ? new THREE.Vector3(-20.0, 5.0, 19.5) : new THREE.Vector3(-18.0, 3.27, 21.0);

    const ctGeo = new THREE.RingGeometry(3.5, 3.8, 32);
    const ctMat = new THREE.MeshBasicMaterial({
      color: 0x3a86ff,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ctMesh = new THREE.Mesh(ctGeo, ctMat);
    ctMesh.rotation.x = -Math.PI / 2;
    ctMesh.position.copy(ctPos);
    this.propsGroup.add(ctMesh);

    const tGeo = new THREE.RingGeometry(3.5, 3.8, 32);
    const tMat = new THREE.MeshBasicMaterial({
      color: 0xe63946,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const tMesh = new THREE.Mesh(tGeo, tMat);
    tMesh.rotation.x = -Math.PI / 2;
    tMesh.position.copy(tPos);
    this.propsGroup.add(tMesh);
  }

  createFallbackGround() {
    const geo = new THREE.PlaneGeometry(120, 120);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc2a677, roughness: 0.9 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.mapGroup.add(ground);
  }

  // Exact polygon point test with generous seam tolerance
  pointInTri(px, pz, ax, az, bx, bz, cx, cz) {
    const v0x = cx - ax, v0z = cz - az;
    const v1x = bx - ax, v1z = bz - az;
    const v2x = px - ax, v2z = pz - az;

    const dot00 = v0x * v0x + v0z * v0z;
    const dot01 = v0x * v1x + v0z * v1z;
    const dot02 = v0x * v2x + v0z * v2z;
    const dot11 = v1x * v1x + v1z * v1z;
    const dot12 = v1x * v2x + v1z * v2z;

    const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    return (u >= -0.05) && (v >= -0.05) && (u + v <= 1.10);
  }

  // Calculate elevation / floor level at any coordinate (x, z)
  getGroundHeight(x, z, currentY = 0) {
    if (!this.floorTriangles || this.floorTriangles.length === 0) {
      return 0;
    }

    let candidates = this.floorTriangles;
    if (this.floorGrid) {
      const cx = Math.floor(x / this.gridCellSize);
      const cz = Math.floor(z / this.gridCellSize);
      const key = cx + ',' + cz;
      const cellList = this.floorGrid.get(key);
      if (cellList && cellList.length > 0) {
        candidates = cellList;
      }
    }

    let bestY = -Infinity;

    // 1. Direct hit on floor or ramp triangle directly below or at step height
    for (let i = 0; i < candidates.length; i++) {
      const f = candidates[i];
      if (x < f.minX - 0.25 || x > f.maxX + 0.25 || z < f.minZ - 0.25 || z > f.maxZ + 0.25) continue;

      if (this.pointInTri(x, z, f.a[0], f.a[2], f.b[0], f.b[2], f.c[0], f.c[2])) {
        let y = f.avgY;
        if (f.ny && Math.abs(f.ny) > 0.0001) {
          y = -(f.nx * x + f.nz * z + f.d) / f.ny;
        }

        if (y <= currentY + 0.65) {
          if (y > bestY) bestY = y;
        }
      }
    }

    if (bestY !== -Infinity) return bestY;

    // 2. Seam & edge fallback: check nearby triangles with exact plane evaluation
    for (let i = 0; i < candidates.length; i++) {
      const f = candidates[i];
      if (x < f.minX - 0.5 || x > f.maxX + 0.5 || z < f.minZ - 0.5 || z > f.maxZ + 0.5) continue;

      let y = f.avgY;
      if (f.ny && Math.abs(f.ny) > 0.0001) {
        y = -(f.nx * x + f.nz * z + f.d) / f.ny;
      }

      if (y <= currentY + 0.65 && y > bestY) {
        bestY = y;
      }
    }

    if (bestY !== -Infinity) return bestY;

    // 3. Falling / airborne fallback: look for any floor below within wider horizontal radius
    for (let i = 0; i < this.floorTriangles.length; i++) {
      const f = this.floorTriangles[i];
      if (x < f.minX - 1.2 || x > f.maxX + 1.2 || z < f.minZ - 1.2 || z > f.maxZ + 1.2) continue;

      let y = f.avgY;
      if (f.ny && Math.abs(f.ny) > 0.0001) {
        y = -(f.nx * x + f.nz * z + f.d) / f.ny;
      }

      if (y <= currentY && y > bestY) {
        bestY = y;
      }
    }

    if (bestY !== -Infinity) return bestY;

    // 4. Over open void: return -10.0 so gravity pulls player down naturally to safety net
    return -10.0;
  }

  isInBuyZone(playerPos, team = 'CT') {
    const zone = team === 'CT' ? this.buyZoneCT : this.buyZoneT;
    return (
      playerPos.x >= zone.minX &&
      playerPos.x <= zone.maxX &&
      playerPos.z >= zone.minZ &&
      playerPos.z <= zone.maxZ
    );
  }

  hitTarget(targetGroup) {
    if (!targetGroup || !targetGroup.userData.isTarget) return;
    targetGroup.userData.hitCount++;
    targetGroup.rotation.x = -Math.PI / 3;
    setTimeout(() => {
      targetGroup.rotation.x = 0;
    }, 1200);
  }
}
