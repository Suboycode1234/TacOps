import * as THREE from 'three';
import { modelManager } from './ModelManager.js';
import { soundManager } from './SoundManager.js';

const T_NAMES = ['Phoenix', 'Leet', 'Guerilla', 'Viper', 'Balkan', 'Sabre'];
const CT_NAMES = ['SAS-Bravo', 'SAS-Ghost', 'SAS-Vanguard', 'SAS-Recon', 'SAS-Strike', 'SAS-Alpha'];

// Verified High-Fidelity Navigation Graph for Dust 2 Largo
// Every node has been verified against the authentic BSP floor collision geometry.
const NAV_NODES = {
  // --- Terrorist Spawn & Long Doors Corridor ---
  T_SPAWN_1: { pos: new THREE.Vector3(-20.0, 3.25, 21.0), hold: 0 },
  T_SPAWN_2: { pos: new THREE.Vector3(-18.0, 3.25, 20.0), hold: 0 },
  T_OUTSIDE_DOORS: { pos: new THREE.Vector3(-10.0, 3.0, 18.0), hold: 0.8, lookAt: new THREE.Vector3(-2.0, 2.0, 16.0) },
  T_DOORS_ENTRY: { pos: new THREE.Vector3(-2.0, 2.0, 16.0), hold: 0 },
  T_DOORS_EXIT: { pos: new THREE.Vector3(6.0, 0.5, 12.0), hold: 1.5, lookAt: new THREE.Vector3(10.0, 0.5, 5.0) },

  // --- Long A Main Street & Chokepoints ---
  LONG_CORNER: { pos: new THREE.Vector3(10.0, 0.5, 5.0), hold: 2.2, lookAt: new THREE.Vector3(14.0, 0.5, -2.0) },
  LONG_CAR: { pos: new THREE.Vector3(14.0, 0.5, -2.0), hold: 2.5, lookAt: new THREE.Vector3(16.0, 0.5, -18.0) },
  LONG_STREET_MID: { pos: new THREE.Vector3(16.0, 0.5, -10.0), hold: 0 },
  LONG_STREET_LOW: { pos: new THREE.Vector3(16.0, 0.5, -18.0), hold: 1.5, lookAt: new THREE.Vector3(18.0, 0.5, -25.0) },
  RAMP_ENTRANCE: { pos: new THREE.Vector3(18.0, 0.5, -25.0), hold: 0 },
  A_RAMP_SLOPE: { pos: new THREE.Vector3(21.0, 3.25, -28.5), hold: 2.0, lookAt: new THREE.Vector3(12.0, 2.44, -39.0) },

  // --- A Bombsite & CT Spawn ---
  A_SITE_EDGE: { pos: new THREE.Vector3(12.0, 2.44, -39.0), hold: 1.8, lookAt: new THREE.Vector3(10.0, 2.44, -42.0) },
  A_SITE_CENTER: { pos: new THREE.Vector3(10.0, 2.44, -42.0), hold: 2.8, lookAt: new THREE.Vector3(8.0, 2.44, -46.0) },
  CT_CROSS: { pos: new THREE.Vector3(8.0, 2.44, -46.0), hold: 1.2, lookAt: new THREE.Vector3(11.0, 2.44, -43.0) },
  CT_SPAWN: { pos: new THREE.Vector3(11.0, 2.44, -43.0), hold: 0 },

  // --- East Flank & Pit Route (Alternative Split Pathway) ---
  EAST_STREET_MID: { pos: new THREE.Vector3(26.0, 0.5, -5.0), hold: 1.0, lookAt: new THREE.Vector3(32.0, 0.5, -15.0) },
  EAST_STREET_LOW: { pos: new THREE.Vector3(32.0, 0.5, -15.0), hold: 0 },
  PIT_ENTRANCE: { pos: new THREE.Vector3(34.0, 0.5, -25.0), hold: 1.8, lookAt: new THREE.Vector3(21.0, 3.25, -28.5) },
  PIT_PLATFORM: { pos: new THREE.Vector3(36.0, 0.5, -34.0), hold: 2.5, lookAt: new THREE.Vector3(12.0, 2.44, -39.0) },
  CT_EAST_CROSS: { pos: new THREE.Vector3(36.0, 0.5, -42.0), hold: 1.5, lookAt: new THREE.Vector3(8.0, 2.44, -46.0) },
};

// Tactical Routes for Terrorists
const T_ROUTES = [
  // Route 0: Aggressive Main Street Push down Long A
  [
    NAV_NODES.T_SPAWN_1, NAV_NODES.T_OUTSIDE_DOORS, NAV_NODES.T_DOORS_ENTRY,
    NAV_NODES.T_DOORS_EXIT, NAV_NODES.LONG_CORNER, NAV_NODES.LONG_CAR,
    NAV_NODES.LONG_STREET_MID, NAV_NODES.LONG_STREET_LOW, NAV_NODES.RAMP_ENTRANCE,
    NAV_NODES.A_RAMP_SLOPE, NAV_NODES.A_SITE_EDGE, NAV_NODES.A_SITE_CENTER
  ],
  // Route 1: East Flank & Pit Control (Splitting off at Doors)
  [
    NAV_NODES.T_SPAWN_2, NAV_NODES.T_OUTSIDE_DOORS, NAV_NODES.T_DOORS_ENTRY,
    NAV_NODES.T_DOORS_EXIT, NAV_NODES.EAST_STREET_MID, NAV_NODES.EAST_STREET_LOW,
    NAV_NODES.PIT_ENTRANCE, NAV_NODES.PIT_PLATFORM, NAV_NODES.CT_EAST_CROSS,
    NAV_NODES.CT_CROSS
  ],
  // Route 2: Chokepoint Car Ambush & Tactical Creep
  [
    NAV_NODES.T_SPAWN_1, NAV_NODES.T_OUTSIDE_DOORS, NAV_NODES.T_DOORS_ENTRY,
    NAV_NODES.LONG_CORNER, NAV_NODES.LONG_CAR, NAV_NODES.LONG_STREET_MID,
    NAV_NODES.RAMP_ENTRANCE, NAV_NODES.PIT_ENTRANCE, NAV_NODES.EAST_STREET_LOW,
    NAV_NODES.EAST_STREET_MID
  ]
];

// Tactical Routes for Counter-Terrorists
const CT_ROUTES = [
  // Route 0: Direct Long A Site to Doors Contest
  [
    NAV_NODES.CT_SPAWN, NAV_NODES.CT_CROSS, NAV_NODES.A_SITE_CENTER,
    NAV_NODES.A_SITE_EDGE, NAV_NODES.A_RAMP_SLOPE, NAV_NODES.RAMP_ENTRANCE,
    NAV_NODES.LONG_STREET_LOW, NAV_NODES.LONG_STREET_MID, NAV_NODES.LONG_CAR,
    NAV_NODES.LONG_CORNER, NAV_NODES.T_DOORS_EXIT
  ],
  // Route 1: Pit & East Flank Intercept
  [
    NAV_NODES.CT_SPAWN, NAV_NODES.CT_EAST_CROSS, NAV_NODES.PIT_PLATFORM,
    NAV_NODES.PIT_ENTRANCE, NAV_NODES.EAST_STREET_LOW, NAV_NODES.EAST_STREET_MID,
    NAV_NODES.T_DOORS_EXIT
  ],
  // Route 2: A Site Anchor & Long Ramp Lock-down
  [
    NAV_NODES.CT_SPAWN, NAV_NODES.CT_CROSS, NAV_NODES.A_SITE_CENTER,
    NAV_NODES.A_SITE_EDGE, NAV_NODES.A_RAMP_SLOPE, NAV_NODES.RAMP_ENTRANCE,
    NAV_NODES.LONG_STREET_LOW, NAV_NODES.RAMP_ENTRANCE, NAV_NODES.A_RAMP_SLOPE,
    NAV_NODES.A_SITE_EDGE
  ]
];


// Tactical Routes for CS2 Official .bin Map Arena
const CS2_T_ROUTES = [
  [
    { pos: new THREE.Vector3(-4.5, 0.4064, 4.5), holdTime: 0.5 },
    { pos: new THREE.Vector3(-2.0, 0.4064, 1.0), holdTime: 0.8 },
    { pos: new THREE.Vector3(0.0, 0.4064, 0.0), holdTime: 1.0 },
    { pos: new THREE.Vector3(3.0, 0.4064, -2.5), holdTime: 0.8 },
    { pos: new THREE.Vector3(4.5, 0.4064, -4.5), holdTime: 1.2 }
  ],
  [
    { pos: new THREE.Vector3(-5.5, 0.4064, 2.5), holdTime: 0.5 },
    { pos: new THREE.Vector3(-4.0, 0.4064, -2.0), holdTime: 0.8 },
    { pos: new THREE.Vector3(-1.0, 0.4064, -5.0), holdTime: 1.0 },
    { pos: new THREE.Vector3(3.5, 0.4064, -4.0), holdTime: 1.2 }
  ],
  [
    { pos: new THREE.Vector3(-3.0, 0.4064, 6.0), holdTime: 0.5 },
    { pos: new THREE.Vector3(2.0, 0.4064, 5.0), holdTime: 0.8 },
    { pos: new THREE.Vector3(4.0, 0.4064, 1.0), holdTime: 1.0 },
    { pos: new THREE.Vector3(2.0, 0.4064, -3.5), holdTime: 1.2 }
  ]
];

const CS2_CT_ROUTES = [
  [
    { pos: new THREE.Vector3(4.5, 0.4064, -4.5), holdTime: 0.5 },
    { pos: new THREE.Vector3(2.0, 0.4064, -1.0), holdTime: 0.8 },
    { pos: new THREE.Vector3(0.0, 0.4064, 0.0), holdTime: 1.0 },
    { pos: new THREE.Vector3(-3.0, 0.4064, 2.5), holdTime: 0.8 },
    { pos: new THREE.Vector3(-4.5, 0.4064, 4.5), holdTime: 1.2 }
  ],
  [
    { pos: new THREE.Vector3(5.5, 0.4064, -2.5), holdTime: 0.5 },
    { pos: new THREE.Vector3(4.0, 0.4064, 2.0), holdTime: 0.8 },
    { pos: new THREE.Vector3(1.0, 0.4064, 5.0), holdTime: 1.0 },
    { pos: new THREE.Vector3(-3.5, 0.4064, 4.0), holdTime: 1.2 }
  ],
  [
    { pos: new THREE.Vector3(3.0, 0.4064, -6.0), holdTime: 0.5 },
    { pos: new THREE.Vector3(-2.0, 0.4064, -5.0), holdTime: 0.8 },
    { pos: new THREE.Vector3(-4.0, 0.4064, -1.0), holdTime: 1.0 },
    { pos: new THREE.Vector3(-2.0, 0.4064, 3.5), holdTime: 1.2 }
  ]
];

export class Bot {
  constructor(id, name, spawnPos, scene, mapManager, team = 'T', routeIdx = 0) {
    this.id = id;
    this.name = name;
    this.spawnPos = spawnPos.clone();
    this.scene = scene;
    this.mapManager = mapManager;
    this.team = team;

    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this.scene.add(this.group);

    // Collision & elevation safety
    this.botRadius = 0.42;
    this.lastValidPos = spawnPos.clone();
    this.lastStuckCheckPos = spawnPos.clone();
    this.stuckTimer = 0;

    // Ground bot initially to ensure exact floor height
    if (this.mapManager && this.mapManager.getGroundHeight) {
      const gh = this.mapManager.getGroundHeight(
        this.group.position.x,
        this.group.position.z,
        this.group.position.y
      );
      if (gh > -4.5) {
        this.group.position.y = gh;
        this.lastValidPos.copy(this.group.position);
      }
    }

    // Enlarged scale multiplier
    this.scaleMultiplier = 1.35;

    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;

    // Authentic walking speeds - always walking as requested
    this.speed = 2.8;       // Smooth tactical walk pace
    this.combatSpeed = 3.2; // Tactical combat walk

    // AI States: 'PATROL', 'HOLD_ANGLE', 'ALERT', 'ATTACK', 'RELOAD', 'DEAD'
    this.state = 'PATROL';
    this.alertTargetPos = null;
    this.alertTimer = 0;
    this.holdTimer = 0;
    this.holdLookTarget = null;

    // Tactical Multi-Route Navigation
    const routePool = this.team === 'T' ? T_ROUTES : CT_ROUTES;
    this.route = routePool[routeIdx % routePool.length];
    this.routeDirection = 1; // 1 = forward, -1 = reverse
    this.currentWaypointIdx = 0;
    this.targetPos = this.route[0].pos.clone();

    // Combat & Strafing
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.strafeInterval = 1.0 + Math.random() * 0.6;

    // Ammo & Reload
    this.maxAmmo = 30;
    this.ammo = 30;
    this.reloadTimer = 0;

    // Shooting Timing & Burst
    this.lastFireTime = 0;
    this.fireInterval = 0.35;
    this.burstCount = 0;
    this.seePlayerTimer = 0;
    this.reactionTime = 0.22 + Math.random() * 0.12;

    // Death Fall Physics
    this.fallProgress = 0;

    // Animation Mixer & Actions
    this.mixer = null;
    this.walkAction = null;
    this.runAction = null;

    // Hitboxes & Attachments
    this.hitboxes = [];
    this.weaponMesh = null;
    this.muzzleLight = null;

    // Immediate visual placeholder so bot is NEVER invisible
    this.placeholder = modelManager.createFallbackCharacter(
      this.team === 'T' ? 0x8a4b28 : 0x213752,
      this.team
    );
    this.placeholder.scale.set(this.scaleMultiplier, this.scaleMultiplier, this.scaleMultiplier);
    this.group.add(this.placeholder);

    // Overhead Tactical UI Billboard
    this.createBillboardUI();

    this.initModel();
    this.createHitboxes();
  }

  createBillboardUI() {
    this.billboardCanvas = document.createElement('canvas');
    this.billboardCanvas.width = 256;
    this.billboardCanvas.height = 64;
    this.billboardCtx = this.billboardCanvas.getContext('2d');

    this.billboardTexture = new THREE.CanvasTexture(this.billboardCanvas);
    this.billboardTexture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: this.billboardTexture,
      transparent: true,
      depthTest: false,
    });
    this.billboardSprite = new THREE.Sprite(spriteMat);
    this.billboardSprite.scale.set(1.6, 0.4, 1.0);
    this.billboardSprite.position.set(0, 2.75, 0);
    this.group.add(this.billboardSprite);

    this.updateBillboardUI();
  }

  updateBillboardUI() {
    if (!this.billboardCtx || this.isDead) return;
    const ctx = this.billboardCtx;
    ctx.clearRect(0, 0, 256, 64);

    // Dark semi-transparent background
    ctx.fillStyle = 'rgba(10, 14, 20, 0.80)';
    ctx.beginPath();
    ctx.roundRect(10, 8, 236, 48, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = this.team === 'T' ? 'rgba(235, 120, 40, 0.85)' : 'rgba(80, 160, 240, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(10, 8, 236, 48, 8);
    ctx.stroke();

    // Bot Name and Team Tag
    ctx.font = 'bold 16px "Share Tech Mono", monospace';
    ctx.fillStyle = this.team === 'T' ? '#ff9944' : '#66b2ff';
    ctx.textAlign = 'left';
    ctx.fillText('[' + this.team + '] ' + this.name, 20, 28);

    // State Indicator Badge
    ctx.font = 'bold 13px sans-serif';
    if (this.state === 'ATTACK') {
      ctx.fillStyle = '#ff3333';
      ctx.fillText('COMBAT', 170, 28);
    } else if (this.state === 'ALERT') {
      ctx.fillStyle = '#ffcc00';
      ctx.fillText('ALERT', 176, 28);
    } else if (this.state === 'HOLD_ANGLE') {
      ctx.fillStyle = '#ffaa33';
      ctx.fillText('PEEKING', 166, 28);
    } else if (this.state === 'RELOAD') {
      ctx.fillStyle = '#ff8800';
      ctx.fillText('RELOAD', 170, 28);
    } else {
      ctx.fillStyle = '#88aacc';
      ctx.fillText('WALK', 178, 28);
    }

    // Health Bar Background
    ctx.fillStyle = 'rgba(40, 45, 55, 0.9)';
    ctx.fillRect(20, 36, 216, 12);

    // Health Bar Fill
    const pct = Math.max(0, this.health / this.maxHealth);
    const healthGradient = ctx.createLinearGradient(20, 0, 20 + 216 * pct, 0);
    if (pct > 0.5) {
      healthGradient.addColorStop(0, '#00cc66');
      healthGradient.addColorStop(1, '#66ff99');
    } else if (pct > 0.25) {
      healthGradient.addColorStop(0, '#ff9900');
      healthGradient.addColorStop(1, '#ffcc00');
    } else {
      healthGradient.addColorStop(0, '#cc0000');
      healthGradient.addColorStop(1, '#ff3333');
    }
    ctx.fillStyle = healthGradient;
    ctx.fillRect(20, 36, 216 * pct, 12);

    // Health Bar border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 36, 216, 12);

    this.billboardTexture.needsUpdate = true;
  }

  async initModel() {
    try {
      if (this.team === 'T') {
        const model = await modelManager.getTerroristModel();
        if (this.placeholder) {
          this.group.remove(this.placeholder);
          this.placeholder = null;
        }

        model.scale.multiplyScalar(this.scaleMultiplier);
        // Rotate 180 degrees so native backwards FBX model faces forward in direction of travel!
        model.rotation.y = Math.PI;
        this.model = model;
        this.group.add(model);

        // Preload authentic walk animation (Walking.fbx)
        const walkClip = await modelManager.getTerroristAnimation('Walking');
        if (model && walkClip) {
          this.mixer = new THREE.AnimationMixer(model);
          this.walkAction = this.mixer.clipAction(walkClip);
          this.walkAction.play(); // ALWAYS WALKING
        }
      } else {
        // CT Bot using Counter-Terrorist model with Blender rig
        const model = await modelManager.getCounterTerroristModel();
        if (this.placeholder) {
          this.group.remove(this.placeholder);
          this.placeholder = null;
        }

        model.scale.multiplyScalar(this.scaleMultiplier);
        this.model = model;
        this.group.add(model);

        // Preload authentic walk animation (walk_loop_blender_fit.fbx)
        const walkClip = await modelManager.getCTAnimation('walk');
        if (model && walkClip) {
          this.mixer = new THREE.AnimationMixer(model);
          this.walkAction = this.mixer.clipAction(walkClip);
          this.walkAction.play(); // ALWAYS WALKING (Never default to running!)
        }
      }

      // Attach weapon to right hand bone
      const gunKey = this.team === 'T' ? 'm16' : 'p90';
      const gun = await modelManager.getWeaponModel(gunKey);
      if (gun) {
        gun.scale.setScalar(0.85);
        const handBone = modelManager.findRightHandBone(this.model);
        if (handBone) {
          if (this.team === 'T') {
            gun.position.set(0.06, 0.12, -0.08);
            gun.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
          } else {
            gun.position.set(0.04, 0.08, -0.06);
            gun.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
          }
          handBone.add(gun);
        } else {
          gun.position.set(0.28, 1.50, 0.38);
          gun.rotation.set(0, -Math.PI / 2, 0);
          this.group.add(gun);
        }
        this.weaponMesh = gun;
      }

      // Muzzle light for bot shooting
      this.muzzleLight = new THREE.PointLight(0xffaa22, 0, 10);
      this.muzzleLight.position.set(0.28, 1.50, 0.85);
      this.group.add(this.muzzleLight);
    } catch (e) {
      console.warn('Bot model init error for team ' + this.team + ':', e);
    }
  }

  createHitboxes() {
    const headMat = new THREE.MeshBasicMaterial({ visible: false, wireframe: true });

    // Head Hitbox - 3.5x critical headshot multiplier
    const headGeo = new THREE.SphereGeometry(0.35, 10, 10);
    const headBox = new THREE.Mesh(headGeo, headMat);
    headBox.position.set(0, 2.22, 0);
    headBox.userData = { bot: this, part: 'head', multiplier: 3.5 };
    this.group.add(headBox);
    this.hitboxes.push(headBox);

    // Torso Hitbox - 1.0x baseline torso multiplier
    const torsoGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10);
    const torsoBox = new THREE.Mesh(torsoGeo, headMat);
    torsoBox.position.set(0, 1.50, 0);
    torsoBox.userData = { bot: this, part: 'body', multiplier: 1.0 };
    this.group.add(torsoBox);
    this.hitboxes.push(torsoBox);

    // Legs Hitbox - 0.75x reduced limb multiplier
    const legGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.95, 10);
    const legBox = new THREE.Mesh(legGeo, headMat);
    legBox.position.set(0, 0.52, 0);
    legBox.userData = { bot: this, part: 'legs', multiplier: 0.75 };
    this.group.add(legBox);
    this.hitboxes.push(legBox);
  }

  resolveCollisions(pos) {
    const r = this.botRadius;
    const stepHeight = 0.45;

    // High-precision circle-to-segment collision with authentic BSP wall normals
    const segments = this.mapManager ? (this.mapManager.getWallSegmentsNear ? this.mapManager.getWallSegmentsNear(pos.x, pos.z) : this.mapManager.wallSegments) : null;
    if (segments && segments.length > 0) {
      for (let i = 0; i < segments.length; i++) {
        const w = segments[i];
        const minY = w.minY !== undefined ? w.minY : (w.yMin !== undefined ? w.yMin : -10);
        const maxY = w.maxY !== undefined ? w.maxY : (w.yMax !== undefined ? w.yMax : 10);
        if (pos.y + 1.8 <= minY || pos.y + stepHeight >= maxY) continue;

        const x1 = w.p1 ? w.p1[0] : (w.x1 !== undefined ? w.x1 : 0);
        const z1 = w.p1 ? w.p1[1] : (w.z1 !== undefined ? w.z1 : 0);
        const x2 = w.p2 ? w.p2[0] : (w.x2 !== undefined ? w.x2 : 0);
        const z2 = w.p2 ? w.p2[1] : (w.z2 !== undefined ? w.z2 : 0);
        const dx = x2 - x1, dz = z2 - z1;
        const lenSq = dx * dx + dz * dz;
        if (lenSq === 0) continue;
        const t = Math.max(0, Math.min(1, ((pos.x - x1) * dx + (pos.z - z1) * dz) / lenSq));
        const cx = x1 + t * dx, cz = z1 + t * dz;
        const distX = pos.x - cx, distZ = pos.z - cz;
        const distSq = distX * distX + distZ * distZ;

        if (distSq < r * r) {
          const dist = Math.sqrt(distSq);
          const overlap = r - dist;
          if (dist > 0.0001) {
            pos.x += (distX / dist) * overlap;
            pos.z += (distZ / dist) * overlap;
          } else {
            pos.x += w.nx * overlap;
            pos.z += w.nz * overlap;
          }
        }
      }
      return;
    }

    const colliders = this.mapManager ? this.mapManager.colliders : null;
    if (!colliders) return;

    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i].box;
      if (
        pos.x + r > box.min.x &&
        pos.x - r < box.max.x &&
        pos.z + r > box.min.z &&
        pos.z - r < box.max.z &&
        pos.y + 1.8 > box.min.y &&
        pos.y + stepHeight < box.max.y
      ) {
        const penX1 = box.max.x - (pos.x - r);
        const penX2 = (pos.x + r) - box.min.x;
        const penZ1 = box.max.z - (pos.z - r);
        const penZ2 = (pos.z + r) - box.min.z;

        const minPen = Math.min(penX1, penX2, penZ1, penZ2);
        if (minPen === penX1) pos.x = box.max.x + r;
        else if (minPen === penX2) pos.x = box.min.x - r;
        else if (minPen === penZ1) pos.z = box.max.z + r;
        else if (minPen === penZ2) pos.z = box.min.z - r;
      }
    }
  }

  hearStimulus(soundPos) {
    if (this.isDead || this.state === 'ATTACK') return;
    const dist = this.group.position.distanceTo(soundPos);
    if (dist < 38) {
      this.state = 'ALERT';
      this.alertTargetPos = soundPos.clone();
      this.alertTimer = 4.0;
      this.seePlayerTimer = 0.15;

      const dir = new THREE.Vector3().subVectors(soundPos, this.group.position).normalize();
      this.group.rotation.y = Math.atan2(dir.x, dir.z);
      this.updateBillboardUI();
    }
  }

  takeDamage(amount, isHeadshot = false, attackerName = 'Player') {
    if (this.isDead) return 0;
    this.health = Math.max(0, this.health - amount);

    // Damage flash
    this.group.traverse((c) => {
      if (c.isMesh && c.material && c.material.color) {
        c.material.color.setHex(0xff3333);
        setTimeout(() => {
          if (c.material && c.material.color) {
            c.material.color.setHex(0xffffff);
          }
        }, 120);
      }
    });

    this.state = 'ATTACK';
    this.seePlayerTimer = this.reactionTime;
    this.updateBillboardUI();

    if (this.health <= 0) {
      this.die(attackerName, isHeadshot);
    }
    return this.health;
  }

  die(killerName, isHeadshot) {
    this.isDead = true;
    this.health = 0;
    this.state = 'DEAD';

    if (this.walkAction) this.walkAction.stop();
    if (this.runAction) this.runAction.stop();

    if (this.billboardSprite) {
      this.billboardSprite.visible = false;
    }

    this.hitboxes.forEach((h) => {
      h.userData.dead = true;
    });

    if (this.muzzleLight) {
      this.muzzleLight.intensity = 0;
    }

    if (this.weaponMesh) {
      this.weaponMesh.position.y = 0.1;
      this.weaponMesh.rotation.z = Math.PI / 2;
    }

    if (this.lastValidPos) {
      this.group.position.y = this.lastValidPos.y;
    }
  }

  update(delta, player, onBotFire) {
    if (this.isDead) {
      // Smooth ragdoll fall over ~0.4s
      if (this.fallProgress < 1.0) {
        this.fallProgress = Math.min(1.0, this.fallProgress + delta * 2.5);
        this.group.rotation.x = -Math.PI / 2 * this.fallProgress;
      }
      return;
    }

    if (!player) return;

    if (this.mixer) {
      this.mixer.update(delta);
    }

    const botPos = this.group.position;
    const playerPos = player.yawObject.position;
    const distToPlayer = botPos.distanceTo(playerPos);

    const canSeePlayer = this.checkLineOfSight(playerPos, distToPlayer);

    if (canSeePlayer) {
      if (this.state !== 'ATTACK') {
        this.state = 'ATTACK';
        this.updateBillboardUI();
      }

      this.seePlayerTimer += delta;

      // Smoothly rotate to track player
      const angle = Math.atan2(playerPos.x - botPos.x, playerPos.z - botPos.z);
      this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, angle, delta * 12);

      // Reloading logic
      if (this.ammo <= 0) {
        this.state = 'RELOAD';
        this.reloadTimer = 2.2;
        this.ammo = this.maxAmmo;
        soundManager.playDryFire();
        this.updateBillboardUI();
      }

      if (this.state === 'RELOAD') {
        this.reloadTimer -= delta;
        if (this.reloadTimer <= 0) {
          this.state = 'ATTACK';
          this.updateBillboardUI();
        }
      }

      // Enhanced Combat Movement: Lateral Tactical Strafing & Distance Control
      const forwardDir = new THREE.Vector3().subVectors(playerPos, botPos).normalize();
      const strafeDir = new THREE.Vector3(-forwardDir.z, 0, forwardDir.x);

      this.strafeTimer += delta;
      if (this.strafeTimer >= this.strafeInterval) {
        this.strafeTimer = 0;
        this.strafeDir *= -1;
        this.strafeInterval = 0.9 + Math.random() * 0.7;
      }

      const moveVec = strafeDir.clone().multiplyScalar(this.strafeDir * 0.85);

      if (distToPlayer > 18) {
        // Advance into effective range
        moveVec.addScaledVector(forwardDir, 0.60);
      } else if (distToPlayer < 7) {
        // Backpedal while shooting
        moveVec.addScaledVector(forwardDir, -0.65);
      }

      botPos.x += moveVec.x * this.combatSpeed * delta;
      botPos.z += moveVec.z * this.combatSpeed * delta;

      // Fire weapon at player once reaction time passes and not reloading
      if (this.seePlayerTimer >= this.reactionTime && this.state !== 'RELOAD') {
        this.tryFireAtPlayer(player, distToPlayer, onBotFire);
      }
    } else {
      this.seePlayerTimer = 0;

      if (this.state === 'ALERT') {
        this.alertTimer -= delta;
        if (this.alertTimer <= 0) {
          this.state = 'PATROL';
          this.updateBillboardUI();
        } else {
          // Advance cautiously toward heard sound
          this.updateInvestigate(delta);
        }
      } else if (this.state === 'HOLD_ANGLE') {
        this.updateHoldAngle(delta);
      } else {
        if (this.state !== 'PATROL') {
          this.state = 'PATROL';
          this.updateBillboardUI();
        }
        this.updatePatrol(delta);
      }
    }

    // 1. Resolve collision against authentic BSP map walls and prop colliders
    this.resolveCollisions(botPos);

    // 2. Hard boundary clamping to Dust II walkable area
    const bounds = (this.mapManager && this.mapManager.mapBounds)
      ? this.mapManager.mapBounds
      : { minX: -23.5, maxX: 47.5, minZ: -80.0, maxZ: 26.5, voidY: -4.5 };

    botPos.x = Math.max(bounds.minX, Math.min(bounds.maxX, botPos.x));
    botPos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, botPos.z));

    // 3. Ground bot to authentic Dust 2 map elevation with void step-back protection
    if (this.mapManager && this.mapManager.getGroundHeight) {
      const gh = this.mapManager.getGroundHeight(botPos.x, botPos.z, botPos.y);
      if (gh > bounds.voidY) {
        botPos.y = gh;
        this.lastValidPos.copy(botPos);
      } else {
        botPos.copy(this.lastValidPos);
        this.strafeDir *= -1;
      }
    }

    // 4. Void fall safety net
    if (botPos.y < bounds.voidY || botPos.x < bounds.minX - 1.0 || botPos.x > bounds.maxX + 1.0 || botPos.z < bounds.minZ - 1.0 || botPos.z > bounds.maxZ + 1.0) {
      const safeSpawn = this.team === 'CT'
        ? (this.mapManager && this.mapManager.spawnPointsCT && this.mapManager.spawnPointsCT.length > 0
            ? this.mapManager.spawnPointsCT[0]
            : new THREE.Vector3(11.38, 2.44, -43.89))
        : (this.mapManager && this.mapManager.spawnPointsT && this.mapManager.spawnPointsT.length > 0
            ? this.mapManager.spawnPointsT[0]
            : new THREE.Vector3(-18.69, 3.25, 20.32));
      botPos.copy(safeSpawn);
      this.lastValidPos.copy(safeSpawn);
      this.strafeDir *= -1;
    }
  }

  checkLineOfSight(playerPos, dist) {
    if (dist > 52) return false;

    // Raycast from bot eye level to player center
    const from = this.group.position.clone();
    from.y += 1.75;
    const to = playerPos.clone();
    to.y += 1.2;

    const rayDist = from.distanceTo(to);
    if (rayDist > 55) return false;

    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const ray = new THREE.Raycaster(from, dir, 0.4, rayDist);

    const testMeshes = [];
    if (this.mapManager.mapGroup && this.mapManager.mapGroup.children) {
      testMeshes.push(...this.mapManager.mapGroup.children);
    }

    const hits = ray.intersectObjects(testMeshes, false);
    if (hits.length > 0 && hits[0].distance < rayDist - 0.5) {
      return false;
    }
    return true;
  }

  tryFireAtPlayer(player, dist, onBotFire) {
    const now = performance.now() / 1000;
    if (now - this.lastFireTime < this.fireInterval) return;

    this.lastFireTime = now;
    this.burstCount++;
    this.ammo--;

    // Dynamic fire rate & bursts based on distance
    if (dist < 10) {
      if (this.burstCount >= 3) {
        this.fireInterval = 1.10 + Math.random() * 0.40;
        this.burstCount = 0;
      } else {
        this.fireInterval = 0.20 + Math.random() * 0.04;
      }
    } else if (dist < 24) {
      if (this.burstCount >= 2) {
        this.fireInterval = 1.25 + Math.random() * 0.45;
        this.burstCount = 0;
      } else {
        this.fireInterval = 0.26 + Math.random() * 0.06;
      }
    } else {
      if (this.burstCount >= 1) {
        this.fireInterval = 1.50 + Math.random() * 0.60;
        this.burstCount = 0;
      } else {
        this.fireInterval = 0.35 + Math.random() * 0.08;
      }
    }

    if (this.muzzleLight) {
      this.muzzleLight.intensity = 3.5;
      setTimeout(() => {
        if (this.muzzleLight) this.muzzleLight.intensity = 0;
      }, 45);
    }

    if (this.team === 'T') {
      soundManager.playM16Shot();
    } else {
      soundManager.playP90Shot();
    }

    // Balanced accuracy with realistic spread
    let baseHitChance = 0.28;
    if (dist > 15) baseHitChance = 0.18;
    if (dist > 30) baseHitChance = 0.08;
    if (player.isCrouching) baseHitChance *= 0.70;
    if (player.isRunning) baseHitChance *= 0.80;

    const isHit = Math.random() < baseHitChance;

    if (isHit && !player.isDead) {
      const roll = Math.random();
      let hitPart = 'body';
      let dmg = Math.floor(10 + Math.random() * 6); // Base 10-15 dmg

      if (roll < 0.16) {
        // 16% Headshot chance
        hitPart = 'head';
        dmg = Math.floor(dmg * 2.8);
      } else if (roll < 0.76) {
        // 60% Torso hit
        hitPart = 'body';
      } else {
        // 24% Leg / Limb hit
        hitPart = 'legs';
        dmg = Math.floor(dmg * 0.75);
      }

      player.takeDamage(dmg, this.name, hitPart);
    }

    if (onBotFire) {
      const muzzlePos = new THREE.Vector3();
      if (this.weaponMesh) {
        this.weaponMesh.getWorldPosition(muzzlePos);
        const botDir = new THREE.Vector3();
        this.group.getWorldDirection(botDir);
        muzzlePos.addScaledVector(botDir, 0.35);
      } else {
        muzzlePos.copy(this.group.position);
        muzzlePos.y += 1.50;
      }
      onBotFire(this, muzzlePos, player.yawObject.position.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        1.3 + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 1.4
      )));
    }
  }

  updateInvestigate(delta) {
    if (!this.alertTargetPos) return;
    const pos = this.group.position;
    const dist = pos.distanceTo(this.alertTargetPos);

    if (dist > 2.0) {
      const dir = new THREE.Vector3().subVectors(this.alertTargetPos, pos).normalize();
      pos.x += dir.x * this.speed * 0.9 * delta;
      pos.z += dir.z * this.speed * 0.9 * delta;
      const angle = Math.atan2(dir.x, dir.z);
      this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, angle, delta * 6);
    }
  }

  updateHoldAngle(delta) {
    this.holdTimer -= delta;

    // Smoothly face target angle
    if (this.holdLookTarget) {
      const dir = new THREE.Vector3().subVectors(this.holdLookTarget, this.group.position).normalize();
      const angle = Math.atan2(dir.x, dir.z);
      this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, angle, delta * 5);
    }

    if (this.holdTimer <= 0) {
      this.state = 'PATROL';
      this.advanceWaypoint();
      this.updateBillboardUI();
    }
  }

  advanceWaypoint() {
    this.currentWaypointIdx += this.routeDirection;

    // If reaching the end of the route, reverse or pick a fresh random route
    if (this.currentWaypointIdx >= this.route.length) {
      this.routeDirection = -1;
      this.currentWaypointIdx = this.route.length - 2;
    } else if (this.currentWaypointIdx < 0) {
      this.routeDirection = 1;
      this.currentWaypointIdx = 1;
    }

    const node = this.route[this.currentWaypointIdx];
    this.targetPos = node.pos.clone();
  }

  updatePatrol(delta) {
    const node = this.route[this.currentWaypointIdx];
    if (!node) {
      this.advanceWaypoint();
      return;
    }

    this.targetPos = node.pos.clone();
    const pos = this.group.position;
    const dist = pos.distanceTo(this.targetPos);

    // Stuck watchdog
    this.stuckTimer += delta;
    if (pos.distanceTo(this.lastStuckCheckPos) > 0.4) {
      this.lastStuckCheckPos.copy(pos);
      this.stuckTimer = 0;
    } else if (this.stuckTimer > 2.0) {
      // Stuck against corner: jump to next waypoint
      this.advanceWaypoint();
      this.stuckTimer = 0;
      return;
    }

    if (dist < 1.6) {
      // Check if node has a tactical angle hold
      if (node.hold && node.hold > 0) {
        this.state = 'HOLD_ANGLE';
        this.holdTimer = node.hold + (Math.random() - 0.5) * 0.6;
        this.holdLookTarget = node.lookAt ? node.lookAt.clone() : null;
        this.updateBillboardUI();
      } else {
        this.advanceWaypoint();
      }
    } else {
      const dir = new THREE.Vector3().subVectors(this.targetPos, pos).normalize();
      pos.x += dir.x * this.speed * delta;
      pos.z += dir.z * this.speed * delta;

      const angle = Math.atan2(dir.x, dir.z);
      this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, angle, delta * 5);
    }
  }

  destroy() {
    if (this.walkAction) this.walkAction.stop();
    if (this.runAction) this.runAction.stop();
    this.scene.remove(this.group);
  }
}

export class BotManager {
  constructor(scene, mapManager) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.bots = [];
    this.botTeam = 'T';
  }

  setBotTeam(team) {
    this.botTeam = team;
  }

  spawnBots(count = 4) {
    this.clearBots();

    const spawnPoints = this.botTeam === 'T'
      ? this.mapManager.spawnPointsT
      : this.mapManager.spawnPointsCT;

    const names = this.botTeam === 'T' ? T_NAMES : CT_NAMES;

    for (let i = 0; i < count; i++) {
      let spawn;
      if (spawnPoints && spawnPoints.length > 0) {
        // Exclude index 5 for T (isolated pit spawn) so bots cluster in base
        const validSpawns = this.botTeam === 'T' && spawnPoints.length >= 6
          ? [spawnPoints[0], spawnPoints[1], spawnPoints[2], spawnPoints[3], spawnPoints[4]]
          : spawnPoints;
        const idx = i % validSpawns.length;
        spawn = validSpawns[idx].clone();
      } else {
        spawn = this.botTeam === 'T'
          ? new THREE.Vector3(-18.69, 3.25, 20.32)
          : new THREE.Vector3(8.13, 2.44, -43.89);
      }

      // Small jitter to prevent bot stacking while avoiding wall clipping
      spawn.x += (Math.random() - 0.5) * 0.5;
      spawn.z += (Math.random() - 0.5) * 0.5;

      const name = names[i % names.length];
      // Assign distinct routes (i = 0, 1, 2, 3) so bots split up!
      const bot = new Bot(i + 1, name, spawn, this.scene, this.mapManager, this.botTeam, i);
      this.bots.push(bot);
    }
  }

  clearBots() {
    this.bots.forEach((b) => b.destroy());
    this.bots = [];
  }

  alertGunshot(soundPos) {
    this.bots.forEach((bot) => {
      if (!bot.isDead) {
        bot.hearStimulus(soundPos);
      }
    });
  }

  alertSpotted(playerPos) {
    this.bots.forEach((bot) => {
      if (!bot.isDead && bot.state !== 'ATTACK') {
        const dist = bot.group.position.distanceTo(playerPos);
        if (dist < 26) {
          bot.hearStimulus(playerPos);
        }
      }
    });
  }

  getAllHitboxes() {
    const list = [];
    this.bots.forEach((bot) => {
      if (!bot.isDead) {
        list.push(...bot.hitboxes);
      }
    });
    return list;
  }

  getAliveBotCount() {
    return this.bots.filter((b) => !b.isDead).length;
  }

  update(delta, player, onBotFire) {
    this.bots.forEach((b) => b.update(delta, player, onBotFire));
  }
}
