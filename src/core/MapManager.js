import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.wallSegments = [];
    this.floorTriangles = [];
    this.floorGrid = null;
    this.wallGrid = null;
    this.gridCellSize = 4.0;
    this.wallGrid = null;
    this.wallCellSize = 6.0;
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
        ['desrt.png', 'deslf.png', 'desup.png', 'desdn.png', 'desft.png', 'desbk.png'],
        () => {
          if (this.currentMapId === 'cs16') {
            this.scene.background = this.skyboxTexture;
          }
        },
        undefined,
        () => {
          console.warn('Dust2 skybox cube texture missing, using atmospheric fallback gradient');
          if (this.currentMapId === 'cs16') {
            this.scene.background = new THREE.Color(0xbdddf4);
          }
        }
      );
    } catch (e) {
      this.scene.background = new THREE.Color(0xbdddf4);
    }
  }

  initLighting() {
    const hemiLight = new THREE.HemisphereLight(0xfff8ee, 0x8a7b64, 0.95);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffdf7, 1.45);
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
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 16;
        loaded.generateMipmaps = true;
        loaded.minFilter = THREE.LinearMipmapLinearFilter;
        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        console.warn('Texture ' + url + ' missing, applying sand fallback');
      }
    );

    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
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
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 8;
        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        console.warn('CS2 Texture ' + url + ' missing, applying fallback');
      }
    );
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
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

  buildWallGrid() {
    this.wallGrid = new Map();
    this.wallCellSize = 6.0;
    if (!this.wallSegments || this.wallSegments.length === 0) return;
    for (let i = 0; i < this.wallSegments.length; i++) {
      const w = this.wallSegments[i];
      const x1 = w.p1 ? w.p1[0] : (w.x1 || 0);
      const z1 = w.p1 ? w.p1[1] : (w.z1 || 0);
      const x2 = w.p2 ? w.p2[0] : (w.x2 || 0);
      const z2 = w.p2 ? w.p2[1] : (w.z2 || 0);
      const minCX = Math.floor(Math.min(x1, x2) / this.wallCellSize);
      const maxCX = Math.floor(Math.max(x1, x2) / this.wallCellSize);
      const minCZ = Math.floor(Math.min(z1, z2) / this.wallCellSize);
      const maxCZ = Math.floor(Math.max(z1, z2) / this.wallCellSize);
      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          const key = cx + ',' + cz;
          let list = this.wallGrid.get(key);
          if (!list) {
            list = [];
            this.wallGrid.set(key, list);
          }
          list.push(w);
        }
      }
    }
  }

  getWallSegmentsNear(x, z) {
    if (!this.wallGrid) return this.wallSegments;
    const cx = Math.floor(x / this.wallCellSize);
    const cz = Math.floor(z / this.wallCellSize);
    const res = [];
    const visited = new Set();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.wallGrid.get((cx + dx) + ',' + (cz + dz));
        if (list) {
          for (let i = 0; i < list.length; i++) {
            const w = list[i];
            if (!visited.has(w)) {
              visited.add(w);
              res.push(w);
            }
          }
        }
      }
    }
    return res.length > 0 ? res : this.wallSegments;
  }

  clearMap() {
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
    this.wallGrid = null;
  }

  async loadMap(mapId = 'cs16') {
    this._loadSessionId = (this._loadSessionId || 0) + 1;
    const session = this._loadSessionId;
    this.isLoading = true;
    this.mapLoaded = false;
    this.currentMapId = mapId;

    const isCS2 = mapId === 'cs2' || mapId === 'csgo';

    // Immediate cleanup of old scene geometry
    this.clearMap();

    // Atmosphere & Skybox switching
    let mapJsonUrl;
    if (mapId === 'cs16') {
      if (this.skyboxTexture) {
        this.scene.background = this.skyboxTexture;
      } else {
        this.scene.background = new THREE.Color(0xbdddf4);
      }
      this.scene.fog = new THREE.FogExp2(0xd6be96, 0.0004);
      mapJsonUrl = '/models/Maps/Dust2/dust2_largo.json';
    } else if (mapId === 'csgo') {
      this.scene.background = new THREE.Color(0x8ec1e8);
      this.scene.fog = new THREE.FogExp2(0x8ec1e8, 0.0008);
      mapJsonUrl = '/models/Maps/Dust2/dust2_largo_csgo.json';
    } else {
      // CS2 4K Remake
      this.scene.background = new THREE.Color(0x6ca0dc);
      this.scene.fog = new THREE.FogExp2(0x6ca0dc, 0.0006);
      mapJsonUrl = '/models/Maps/Dust2/cs2_dust2_4k.json';
    }

    try {
      const res = await fetch(mapJsonUrl);
      if (!res.ok) throw new Error('HTTP error ' + res.status);
      const data = await res.json();

      // Check if another map load was triggered while fetching JSON
      if (this._loadSessionId !== session) {
        console.log(`[MapManager] Discarding outdated map load for ${mapId} (session ${session})`);
        return;
      }

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
        this.buildWallGrid();
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
        console.log('[MapManager] Loading visual world from: ' + data.glbUrl);
        const gltfLoader = new GLTFLoader();
        const gltf = await new Promise((resolve, reject) => {
          gltfLoader.load(data.glbUrl, resolve, undefined, reject);
        });

        // Double check session after GLB download completes
        if (this._loadSessionId !== session) {
          console.log(`[MapManager] Discarding outdated GLB load for ${mapId} (session ${session})`);
          return;
        }

        // Final guarantee: clear mapGroup before adding new scene
        this.clearMap();

        // Re-assign collision data because clearMap wiped it
        if (data.floorTriangles) {
          this.floorTriangles = data.floorTriangles;
          this.buildFloorGrid();
        }
        if (data.wallSegments) {
          this.wallSegments = data.wallSegments;
          this.buildWallGrid();
        }

        const textureMap = data.textureMap || {};

        gltf.scene.traverse((c) => {
          if (c.isMesh) {
            c.receiveShadow = true;
            c.castShadow = false;

            const name = (c.name || '').toLowerCase();

            // Occlusion filter: Cleanly hide true occluders, never roads or floors
            const isOccluder = (
              name.includes('blocklight') ||
              name.includes('shadow') ||
              name.includes('overlay') ||
              name.includes('black_simple') ||
              name.includes('mat0_black') ||
              name.includes('agg10_8_black') ||
              name.includes('toolsblack') ||
              name.includes('nodraw')
            ) && !name.includes('blacktop') && !name.includes('ground') && !name.includes('floor');

            if (isOccluder) {
              c.visible = false;
              return;
            }

            // Extract material tag from mesh name
            let tag = name;
            const m = c.name.match(/agg\d+_\d+_(.+?)(?:_\d+)?$/);
            if (m) tag = m[1].toLowerCase();
            else if (name.includes('nomerge')) tag = 'nomerge';

            const cleanTag = tag.replace(/_fragment\d+/, '').replace(/_draw\d+/, '').replace(/_\d+$/, '');
            const texFile = textureMap[tag] || textureMap[cleanTag] || textureMap[cleanTag.split('_')[0]];

            // Physical material properties tailored to surface type
            let roughness = 0.85;
            let metalness = 0.05;
            let fallbackColor = 0xd8c29d; // Sandstone plaster
            let side = THREE.FrontSide;

            if (/metal|iron|steel|corrugated|grate|vent|pipe|scaffold|can|barrel/.test(tag)) {
              roughness = 0.4;
              metalness = 0.75;
              fallbackColor = 0x6e767d;
              if (/grate|fence|rail/.test(tag)) side = THREE.DoubleSide;
            } else if (/car|vehicle|truck|van|trike|vespa/.test(tag)) {
              roughness = 0.3;
              metalness = 0.6;
              fallbackColor = 0x8a3838;
            } else if (/wood|plank|crate|plywood|timber|door/.test(tag)) {
              roughness = 0.75;
              metalness = 0.02;
              fallbackColor = 0x855838;
            } else if (/blacktop|tarmac|asphalt|road/.test(tag)) {
              roughness = 0.9;
              metalness = 0.1;
              fallbackColor = 0x36383b;
            } else if (/grass|weed|tree|branch|palm|flower|frond|foliage/.test(tag)) {
              roughness = 0.6;
              metalness = 0.0;
              fallbackColor = 0x4f6e3c;
              side = THREE.DoubleSide;
            } else if (/awning|cloth|tarp|fabric/.test(tag)) {
              roughness = 0.7;
              metalness = 0.0;
              fallbackColor = 0xa8483b;
              side = THREE.DoubleSide;
            } else if (/concrete/.test(tag)) {
              roughness = 0.85;
              metalness = 0.05;
              fallbackColor = 0x9e978c;
            } else if (/brick/.test(tag)) {
              roughness = 0.9;
              metalness = 0.02;
              fallbackColor = 0x9c654f;
            }

            const hasVertexColors = !!(c.geometry && c.geometry.attributes.color);
            const matConfig = {
              roughness: roughness,
              metalness: metalness,
              side: side,
              vertexColors: hasVertexColors
            };
            if (texFile) {
              matConfig.map = this.getCS2Texture(texFile);
            } else {
              matConfig.color = fallbackColor;
            }
            c.material = new THREE.MeshStandardMaterial(matConfig);
          }
        });

        this.mapGroup.add(gltf.scene);
      } else {
        // Construct from meshesData (CS 1.6 Classic)
        this.clearMap();
        if (data.floorTriangles) {
          this.floorTriangles = data.floorTriangles;
          this.buildFloorGrid();
        }
        if (data.wallSegments) {
          this.wallSegments = data.wallSegments;
          this.buildWallGrid();
        }

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
      this.isLoading = false;
      console.log('[MapManager] ' + (isCS2 ? (mapId === 'cs2' ? 'CS2 4K Remake' : 'CS:GO Edition') : 'CS 1.6 Classic') + ' loaded: ' + this.floorTriangles.length + ' floors, ' + this.wallSegments.length + ' wall segments.');

      if (this.onMapLoaded) {
        this.onMapLoaded(mapId);
      }
    } catch (e) {
      this.isLoading = false;
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
    const ctPos = isCS2 ? new THREE.Vector3(58.0, -3.1, 6.0) : new THREE.Vector3(10.0, 2.46, -44.0);
    const tPos = isCS2 ? new THREE.Vector3(-20.0, 3.4, -20.0) : new THREE.Vector3(-18.0, 3.27, 21.0);

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

    let candidates = [];
    if (this.floorGrid) {
      const cx = Math.floor(x / this.gridCellSize);
      const cz = Math.floor(z / this.gridCellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cellList = this.floorGrid.get((cx + dx) + ',' + (cz + dz));
          if (cellList) {
            for (let i = 0; i < cellList.length; i++) candidates.push(cellList[i]);
          }
        }
      }
    }
    if (candidates.length === 0) {
      candidates = this.floorTriangles;
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

    // 2. Seam & edge fallback: check nearby candidate triangles with exact plane evaluation
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

      if (y <= currentY + 0.65 && y > bestY) {
        bestY = y;
      }
    }

    if (bestY !== -Infinity) return bestY;

    // 4. Over open void
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
