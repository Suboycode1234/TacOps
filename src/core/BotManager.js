import * as THREE from 'three';
import { modelManager } from './ModelManager.js';
import { soundManager } from './SoundManager.js';

const T_NAMES = ['Phoenix', 'Leet', 'Guerilla', 'Viper', 'Balkan', 'Sabre'];
const CT_NAMES = ['SAS-Bravo', 'SAS-Ghost', 'SAS-Vanguard', 'SAS-Recon', 'SAS-Strike', 'SAS-Alpha'];

export class Bot {
  constructor(id, name, spawnPos, scene, mapManager, team = 'T') {
    this.id = id;
    this.name = name;
    this.spawnPos = spawnPos.clone();
    this.scene = scene;
    this.mapManager = mapManager;
    this.team = team;

    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this.scene.add(this.group);

    // Enlarged scale multiplier
    this.scaleMultiplier = 1.35;

    this.health = 100;
    this.maxHealth = 100;
    this.isDead = false;
    this.speed = 3.6;
    this.combatSpeed = 4.2;

    // AI States: 'PATROL', 'ALERT', 'ATTACK', 'RELOAD', 'DEAD'
    this.state = 'PATROL';
    this.alertTargetPos = null;
    this.alertTimer = 0;

    // Combat & Strafing
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.strafeInterval = 1.2 + Math.random() * 0.8;

    // Ammo & Reload
    this.maxAmmo = 30;
    this.ammo = 30;
    this.reloadTimer = 0;

    // Authentic Dust 2 Largo Patrol Waypoints along Long A
    this.patrolWaypoints = [
      new THREE.Vector3(-18.0, 3.25, 20.0), // T Base Outside Long Doors
      new THREE.Vector3(-10.0, 3.25, 16.0), // Outside Long Doors peeking
      new THREE.Vector3(-2.0, 2.8, 14.0),   // Inside Long Doors
      new THREE.Vector3(4.0, 2.5, 10.0),    // Blue box exit
      new THREE.Vector3(6.0, 2.2, 0.0),     // Long A Corner (Car)
      new THREE.Vector3(8.0, 1.8, -15.0),   // Long A Mid Alley
      new THREE.Vector3(14.0, 0.5, -25.0),  // Pit Edge
      new THREE.Vector3(10.0, 2.2, -32.0),  // Long A Site Ramp
      new THREE.Vector3(10.0, 2.44, -42.0), // A Bombsite edge
      new THREE.Vector3(6.0, 2.44, -48.0),  // CT Cross
    ];
    this.currentWaypointIdx = Math.floor(Math.random() * this.patrolWaypoints.length);
    this.targetPos = this.patrolWaypoints[this.currentWaypointIdx].clone();

    // Shooting Timing & Burst
    this.lastFireTime = 0;
    this.fireInterval = 0.35;
    this.burstCount = 0;
    this.seePlayerTimer = 0;
    this.reactionTime = 0.22 + Math.random() * 0.14;

    // Death Fall Physics
    this.fallProgress = 0;

    // Animation Mixer
    this.mixer = null;
    this.walkAction = null;
    this.runAction = null;

    // Hitboxes & Attachments
    this.hitboxes = [];
    this.weaponMesh = null;
    this.muzzleLight = null;

    // Immediate visual placeholder (enlarged) so bot is NEVER invisible
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

    // Background panel
    ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();

    // Border
    const teamColor = this.team === 'CT' ? '#38bdf8' : '#f97316';
    ctx.strokeStyle = this.state === 'ATTACK' ? '#ef4444' : teamColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Name & State Text
    ctx.font = 'bold 18px "Inter", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${this.name}`, 14, 26);

    ctx.font = 'bold 13px "Inter", monospace';
    ctx.fillStyle = this.state === 'ATTACK' ? '#ef4444' : (this.state === 'ALERT' ? '#eab308' : '#94a3b8');
    const stateLabel = this.state === 'ATTACK' ? 'ENGAGING' : (this.state === 'RELOAD' ? 'RELOADING' : this.state);
    ctx.fillText(`[${stateLabel}]`, 140, 25);

    // Health Bar Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(14, 36, 228, 14);

    // Health Bar Fill
    const hpPct = Math.max(0, this.health / this.maxHealth);
    let barColor = '#22c55e';
    if (hpPct < 0.35) barColor = '#ef4444';
    else if (hpPct < 0.65) barColor = '#eab308';

    ctx.fillStyle = barColor;
    ctx.fillRect(14, 36, 228 * hpPct, 14);

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

        // Apply scale multiplier for enlarged tactical presence
        model.scale.multiplyScalar(this.scaleMultiplier);
        this.model = model;
        this.group.add(model);

        // Preload and attach Mixamo animations
        const [walkClip, runClip] = await Promise.all([
          modelManager.getTerroristAnimation('Walking'),
          modelManager.getTerroristAnimation('Running'),
        ]);

        if (model) {
          this.mixer = new THREE.AnimationMixer(model);
          if (walkClip) this.walkAction = this.mixer.clipAction(walkClip);
          if (runClip) this.runAction = this.mixer.clipAction(runClip);
          if (this.walkAction) this.walkAction.play();
        }
      } else {
        // CT Bot using the new Counter-Terrorist model with Blender rig
        const model = await modelManager.getCounterTerroristModel();
        if (this.placeholder) {
          this.group.remove(this.placeholder);
          this.placeholder = null;
        }

        model.scale.multiplyScalar(this.scaleMultiplier);
        this.model = model;
        this.group.add(model);

        // Preload and attach CT animations
        const [jogClip, walkClip] = await Promise.all([
          modelManager.getCTAnimation('jog'),
          modelManager.getCTAnimation('walk'),
        ]);

        if (model) {
          this.mixer = new THREE.AnimationMixer(model);
          if (walkClip) this.walkAction = this.mixer.clipAction(walkClip);
          if (jogClip) this.runAction = this.mixer.clipAction(jogClip);
          if (this.runAction) this.runAction.play();
          else if (this.walkAction) this.walkAction.play();
        }
      }

      // Attach weapon to right hand bone
      const gunKey = this.team === 'T' ? 'm16' : 'p90';
      const gun = await modelManager.getWeaponModel(gunKey);
      if (gun) {
        gun.scale.setScalar(0.85);
        const handBone = modelManager.findRightHandBone(model);
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
      console.warn(`Bot model init error for team ${this.team}:`, e);
    }
  }

  createHitboxes() {
    const headMat = new THREE.MeshBasicMaterial({ visible: false, wireframe: true });

    // Head Hitbox (enlarged & adjusted for ~2.4m height)
    const headGeo = new THREE.SphereGeometry(0.34, 10, 10);
    const headBox = new THREE.Mesh(headGeo, headMat);
    headBox.position.set(0, 2.22, 0);
    headBox.userData = { bot: this, part: 'head', multiplier: 2.8 };
    this.group.add(headBox);
    this.hitboxes.push(headBox);

    // Torso Hitbox
    const torsoGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10);
    const torsoBox = new THREE.Mesh(torsoGeo, headMat);
    torsoBox.position.set(0, 1.50, 0);
    torsoBox.userData = { bot: this, part: 'body', multiplier: 1.0 };
    this.group.add(torsoBox);
    this.hitboxes.push(torsoBox);

    // Legs Hitbox
    const legGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.95, 10);
    const legBox = new THREE.Mesh(legGeo, headMat);
    legBox.position.set(0, 0.52, 0);
    legBox.userData = { bot: this, part: 'legs', multiplier: 0.75 };
    this.group.add(legBox);
    this.hitboxes.push(legBox);
  }

  hearStimulus(soundPos) {
    if (this.isDead || this.state === 'ATTACK') return;
    const dist = this.group.position.distanceTo(soundPos);
    if (dist < 38) {
      this.state = 'ALERT';
      this.alertTargetPos = soundPos.clone();
      this.alertTimer = 4.5;
      this.seePlayerTimer = 0.15; // Quicker reaction if already alert

      // Turn towards sound source
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

    // Ground bot to authentic Dust 2 map elevation
    if (this.mapManager && this.mapManager.getGroundHeight) {
      this.group.position.y = this.mapManager.getGroundHeight(
        this.group.position.x,
        this.group.position.z,
        this.group.position.y
      );
    }

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

      // Rotate to track player
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
      const strafeDir = new THREE.Vector3(-forwardDir.z, 0, forwardDir.x); // Perpendicular

      this.strafeTimer += delta;
      if (this.strafeTimer >= this.strafeInterval) {
        this.strafeTimer = 0;
        this.strafeDir *= -1;
        this.strafeInterval = 1.0 + Math.random() * 1.2;
      }

      const moveVec = strafeDir.clone().multiplyScalar(this.strafeDir * 0.75);

      if (distToPlayer > 18) {
        // Advance into effective firing range
        moveVec.addScaledVector(forwardDir, 0.65);
      } else if (distToPlayer < 7) {
        // Backpedal while shooting if player rushes
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
          // Advance cautiously toward last heard sound
          this.updateInvestigate(delta);
        }
      } else {
        if (this.state !== 'PATROL') {
          this.state = 'PATROL';
          this.updateBillboardUI();
        }
        this.updatePatrol(delta);
      }
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

    // Dynamic fire rate & bursts based on distance (reduced for balanced gameplay)
    if (dist < 10) {
      // Close range: 3-round burst with tactical pause
      if (this.burstCount >= 3) {
        this.fireInterval = 1.15 + Math.random() * 0.45;
        this.burstCount = 0;
      } else {
        this.fireInterval = 0.20 + Math.random() * 0.04;
      }
    } else if (dist < 24) {
      // Mid range: 2-round burst
      if (this.burstCount >= 2) {
        this.fireInterval = 1.35 + Math.random() * 0.50;
        this.burstCount = 0;
      } else {
        this.fireInterval = 0.26 + Math.random() * 0.06;
      }
    } else {
      // Long range: 1-round tap
      if (this.burstCount >= 1) {
        this.fireInterval = 1.60 + Math.random() * 0.65;
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
      // Reduced damage: 5-8 dmg per hit so player can fight back
      const dmg = Math.floor(5 + Math.random() * 4);
      player.takeDamage(dmg, this.name, 'body');
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

  updatePatrol(delta) {
    if (!this.targetPos) {
      this.targetPos = this.patrolWaypoints[this.currentWaypointIdx].clone();
    }

    const pos = this.group.position;
    const dist = pos.distanceTo(this.targetPos);

    if (dist < 1.8) {
      this.currentWaypointIdx = (this.currentWaypointIdx + 1) % this.patrolWaypoints.length;
      this.targetPos = this.patrolWaypoints[this.currentWaypointIdx].clone();
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
        const idx = (i + 1) % spawnPoints.length;
        spawn = spawnPoints[idx].clone();
      } else {
        spawn = this.botTeam === 'T'
          ? new THREE.Vector3(-18.69, 3.25, 20.32)
          : new THREE.Vector3(8.13, 2.44, -43.89);
      }
      spawn.x += (Math.random() - 0.5) * 1.5;
      spawn.z += (Math.random() - 0.5) * 1.5;

      const name = names[i % names.length];
      const bot = new Bot(i + 1, name, spawn, this.scene, this.mapManager, this.botTeam);
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
