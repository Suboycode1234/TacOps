import * as THREE from 'three';

export class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.wallSegments = [];
    this.floorTriangles = [];
    this.targets = [];
    this.textureCache = new Map();

    // Default Spawns (authentic CS:GO / 1.6 de_dust2_largo coordinates)
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

    this.buyZoneCT = { minX: 4, maxX: 16, minZ: -56, maxZ: -36 };
    this.buyZoneT = { minX: -26, maxX: 8, minZ: 14, maxZ: 28 };
    this.mapBounds = { minX: -23.5, maxX: 47.5, minZ: -80.0, maxZ: 26.5, voidY: -4.5 };

    this.currentMapId = 'cs16'; // 'cs16' or 'csgo'
    this.mapLoaded = false;
    this.onMapLoaded = null;

    // Groups
    this.mapGroup = new THREE.Group();
    this.mapGroup.name = 'Dust2_Terrain_Group';
    this.scene.add(this.mapGroup);

    this.propsGroup = new THREE.Group();
    this.propsGroup.name = 'Dust2_Props_Group';
    this.scene.add(this.propsGroup);

    this.setupLighting();
    this.loadMap('cs16');
  }

  setupLighting() {
    // 1. Desert Skybox from original CS 1.6 / Source assets
    const cubeLoader = new THREE.CubeTextureLoader();
    cubeLoader.setPath('/models/Maps/Dust2/skybox/');
    try {
      const skyboxTexture = cubeLoader.load(
        ['desrt.png', 'deslf.png', 'desup.png', 'desdn.png', 'desbk.png', 'desft.png'],
        () => {
          this.scene.background = skyboxTexture;
        },
        undefined,
        (err) => {
          console.warn('Could not load skybox cubemap, falling back to sky color:', err);
          this.scene.background = new THREE.Color(0xd6be96);
        }
      );
    } catch (e) {
      this.scene.background = new THREE.Color(0xd6be96);
    }

    // Atmospheric desert haze
    this.scene.fog = new THREE.FogExp2(0xd6be96, 0.0025);

    // Warm Mediterranean daylight bounce & ambient fill
    const ambientLight = new THREE.AmbientLight(0xfff0dd, 0.75);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xfffaed, 0xa5886a, 0.65);
    hemiLight.position.set(0, 60, 0);
    this.scene.add(hemiLight);

    // High noon Mediterranean sunlight shining directly down into corridors
    const sunLight = new THREE.DirectionalLight(0xfffaea, 1.25);
    sunLight.position.set(10, 85, -10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 220;
    const d = 75;
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
    const url = `/models/Maps/Dust2/textures/${cleanName}.png`;

    const tex = loader.load(
      url,
      (loaded) => {
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.RepeatWrapping;
        loaded.needsUpdate = true;
      },
      undefined,
      () => {
        console.warn(`Texture ${url} missing, applying sand fallback`);
      }
    );

    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    this.textureCache.set(textureName, tex);
    return tex;
  }

  async loadMap(mapId = 'cs16') {
    this.currentMapId = mapId;
    this.mapLoaded = false;

    // 1. Dispose old terrain geometry and meshes
    while (this.mapGroup.children.length > 0) {
      const child = this.mapGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      this.mapGroup.remove(child);
    }

    // 2. Dispose old props and targets
    while (this.propsGroup.children.length > 0) {
      const child = this.propsGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      this.propsGroup.remove(child);
    }

    this.targets = [];
    this.colliders = [];
    this.wallSegments = [];
    this.floorTriangles = [];

    const mapJsonUrl = mapId === 'csgo'
      ? '/models/Maps/Dust2/dust2_largo_csgo.json'
      : '/models/Maps/Dust2/dust2_largo.json';

    try {
      const res = await fetch(mapJsonUrl);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      // Set Map Bounds & Buy Zones
      if (data.bounds) {
        this.mapBounds = data.bounds;
      } else if (mapId === 'csgo') {
        this.mapBounds = { minX: -74.0, maxX: 74.0, minZ: -100.0, maxZ: 48.0, voidY: -7.5 };
      } else {
        this.mapBounds = { minX: -23.5, maxX: 47.5, minZ: -80.0, maxZ: 26.5, voidY: -4.5 };
      }

      if (mapId === 'csgo') {
        this.buyZoneCT = { minX: 0, maxX: 16, minZ: -65, maxZ: -50 };
        this.buyZoneT = { minX: -28, maxX: -6, minZ: 14, maxZ: 28 };
      } else {
        this.buyZoneCT = { minX: 4, maxX: 16, minZ: -56, maxZ: -36 };
        this.buyZoneT = { minX: -26, maxX: 8, minZ: 14, maxZ: 28 };
      }

      // 1. Spawns
      if (data.spawns) {
        if (data.spawns.CT && data.spawns.CT.length > 0) {
          this.spawnPointsCT = data.spawns.CT.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        }
        if (data.spawns.T && data.spawns.T.length > 0) {
          this.spawnPointsT = data.spawns.T.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        }
      }

      // 2. Floor Triangles for Elevation Queries & Slope Walking
      if (data.floorTriangles) {
        this.floorTriangles = data.floorTriangles;
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

      // 5. Construct 3D Geometry for each texture group
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
        const mat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.85,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.name = `Dust2_${mapId}_${texKey}`;
        this.mapGroup.add(mesh);
      }

      // 6. Tactical interactive shooting targets
      this.createShootingTargets();

      // 7. Buy zone visual decals
      this.createBuyZoneDecals();

      this.mapLoaded = true;
      console.log(`[MapManager] ${mapId === 'csgo' ? 'CS:GO Edition' : 'CS 1.6 Classic'} map loaded: ${Object.keys(meshesData).length} meshes, ${this.floorTriangles.length} floors, ${this.wallSegments.length} wall segments.`);

      if (this.onMapLoaded) {
        this.onMapLoaded(mapId);
      }
    } catch (e) {
      console.error(`Failed to load map ${mapId}, falling back to procedural ground:`, e);
      this.createFallbackGround();
    }
  }

  // Backward compatible alias
  async loadDust2Map() {
    return this.loadMap(this.currentMapId || 'cs16');
  }

  createShootingTargets() {
    const targetPositions = [
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
    ctMesh.position.set(10, 2.46, -44);
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
    tMesh.position.set(-18, 3.27, 21);
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

    let bestY = -Infinity;

    // 1. Direct hit on floor or ramp triangle directly below or at step height
    for (let i = 0; i < this.floorTriangles.length; i++) {
      const f = this.floorTriangles[i];
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
    for (let i = 0; i < this.floorTriangles.length; i++) {
      const f = this.floorTriangles[i];
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

    // 4. Over open void or abyss: return -10.0 so gravity pulls player down naturally to safety net
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
