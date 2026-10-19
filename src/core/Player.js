import * as THREE from 'three';
import { WEAPONS, EQUIPMENT } from './WeaponData.js';
import { soundManager } from './SoundManager.js';
import { modelManager } from './ModelManager.js';

export class Player {
  constructor(camera, scene, domElement, mapManager, team = 'CT') {
    this.camera = camera;
    this.scene = scene;
    this.domElement = domElement;
    this.mapManager = mapManager;
    this.team = team;

    // Ensure camera near clipping plane doesn't clip first-person weapon
    this.camera.near = 0.01;
    this.camera.updateProjectionMatrix();

    // 1st / 3rd Person camera rig
    this.pitchObject = new THREE.Object3D();
    this.pitchObject.add(this.camera);
    this.yawObject = new THREE.Object3D();
    const spawn = this.team === 'CT'
      ? (this.mapManager.spawnPointsCT[0] || new THREE.Vector3(11.38, 2.44, -43.89))
      : (this.mapManager.spawnPointsT[0] || new THREE.Vector3(-18.69, 3.25, 22.76));
    this.yawObject.position.copy(spawn);
    this.yawObject.add(this.pitchObject);
    this.scene.add(this.yawObject);

    // 3rd Person State
    this.isThirdPerson = false;
    this.thirdPersonTargetCamPos = new THREE.Vector3(0, 0, 0);
    this.playerBodyGroup = new THREE.Group();
    this.playerBodyGroup.visible = false; // Hidden in 1st person
    this.yawObject.add(this.playerBodyGroup);
    this.bodyModel = null;
    this.thirdPersonGunMesh = null;

    // Knife Combo & Animation State
    this.knifeComboIndex = 0; // 0: Swing 1, 1: Swing 2, 2: Swing 3, 3: Swing 4
    this.knifeLastClickTime = 0;
    this.isSwingingKnife = false;
    this.knifeMixer = null;
    this.knifeActions = {};

    // Viewmodel container in camera space (1st person)
    this.viewmodelContainer = new THREE.Group();
    this.camera.add(this.viewmodelContainer);

    // Muzzle flash light
    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 10);
    this.muzzleLight.position.set(0.22, -0.15, -0.65);
    this.camera.add(this.muzzleLight);

    // Player stats
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 100;
    this.hasHelmet = true;
    this.money = 16000;
    this.isDead = false;

    // Kinematics
    this.velocity = new THREE.Vector3();
    this.onGround = true;
    this.isCrouching = false;
    this.isRunning = false;
    this.isADS = false;
    this.standHeight = 1.65;
    this.crouchHeight = 1.05;
    this.currentHeight = 1.65;
    this.playerRadius = 0.4;

    // Body animation state
    this.bodyMixer = null;
    this.bodyActions = {};
    this.currentAction = null;
    this.isJumpingAnim = false;
    this.bodyModelLoadingId = 0;
    this.lastLoadedTeam = null;

    // Input state
    this.keys = {
      KeyW: false,
      KeyS: false,
      KeyA: false,
      KeyD: false,
      Space: false,
      ShiftLeft: false,
      ShiftRight: false,
      ControlLeft: false,
    };
    this.isMouseDown = false;
    this.isRightMouseDown = false;
    this.mouseSensitivity = 0.0022;

    // Inventory
    this.inventory = {
      1: null,
      2: { ...WEAPONS.deagle, ammo: WEAPONS.deagle.magSize, reserve: WEAPONS.deagle.maxReserve },
      3: { ...WEAPONS.knife, ammo: Infinity, reserve: Infinity },
    };
    this.activeSlot = 2;
    this.lastActiveSlot = 3;
    this.activeWeapon = this.inventory[2];

    // Weapon state
    this.lastShootTime = 0;
    this.isReloading = false;
    this.reloadStartTime = 0;
    this.recoilOffset = new THREE.Vector3();
    this.swayRot = new THREE.Vector3();
    this.bobTimer = 0;

    // Viewmodel models cache
    this.weaponModels = new Map();

    // Callbacks
    this.onShoot = null;
    this.onHit = null;
    this.onKill = null;
    this.onStatsChange = null;

    // Pointer Lock
    this.isLocked = false;
    this.setupControls();

    this.updateActiveWeaponModel();
    this.loadWeapons();
  }

  setupControls() {
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked && !this.isDead) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || this.isDead) return;

      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      // Mouse Look
      this.yawObject.rotation.y -= movementX * this.mouseSensitivity;
      this.pitchObject.rotation.x -= movementY * this.mouseSensitivity;
      this.pitchObject.rotation.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, this.pitchObject.rotation.x)
      );

      // Weapon inertia sway
      this.swayRot.y -= movementX * 0.0006;
      this.swayRot.x -= movementY * 0.0006;
    });

    window.addEventListener('keydown', (e) => {
      if (this.keys.hasOwnProperty(e.code)) {
        this.keys[e.code] = true;
      }

      // Weapon slots switch
      if (e.code === 'Digit1') this.switchSlot(1);
      if (e.code === 'Digit2') this.switchSlot(2);
      if (e.code === 'Digit3') this.switchSlot(3);
      if (e.code === 'KeyQ') this.quickSwitch();
      if (e.code === 'KeyR') this.reload();

      // Toggle 1st / 3rd Person View
      if (e.code === 'KeyV') {
        this.toggleCameraMode();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.keys.hasOwnProperty(e.code)) {
        this.keys[e.code] = false;
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (!this.isLocked || this.isDead) return;
      if (e.button === 0) {
        this.isMouseDown = true;
        this.tryFire();
      } else if (e.button === 2) {
        this.isRightMouseDown = true;
        this.isADS = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
      } else if (e.button === 2) {
        this.isRightMouseDown = false;
        this.isADS = false;
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.isLocked) e.preventDefault();
    });
  }

  toggleCameraMode() {
    this.isThirdPerson = !this.isThirdPerson;
    this.playerBodyGroup.visible = this.isThirdPerson;
    this.viewmodelContainer.visible = !this.isThirdPerson;

    if (!this.isThirdPerson) {
      this.camera.position.set(0, 0, 0);
    }
    soundManager.playDryFire();
    this.triggerStatsChange();
  }

  async loadPlayerBodyModel() {
    const currentLoadId = ++this.bodyModelLoadingId;
    this.lastLoadedTeam = this.team;

    this.bodyMixer = null;
    this.bodyActions = {};
    this.currentAction = null;
    this.isJumpingAnim = false;

    try {
      let model;
      if (this.team === 'CT') {
        const [ctModel, walkClip, jogClip, jumpClip] = await Promise.all([
          modelManager.getCounterTerroristModel(),
          modelManager.getCTAnimation('walk'),
          modelManager.getCTAnimation('jog'),
          modelManager.getCTAnimation('jump'),
        ]);

        if (currentLoadId !== this.bodyModelLoadingId) return;

        model = ctModel;
        // Clean out any existing children immediately before adding new model
        while (this.playerBodyGroup.children.length > 0) {
          this.playerBodyGroup.remove(this.playerBodyGroup.children[0]);
        }
        this.bodyModel = model;
        this.playerBodyGroup.add(model);

        if (model) {
          this.bodyMixer = new THREE.AnimationMixer(model);
          if (walkClip) this.bodyActions.walk = this.bodyMixer.clipAction(walkClip);
          if (jogClip) this.bodyActions.jog = this.bodyMixer.clipAction(jogClip);
          if (jumpClip) {
            this.bodyActions.jump = this.bodyMixer.clipAction(jumpClip);
            this.bodyActions.jump.setLoop(THREE.LoopOnce, 1);
            this.bodyActions.jump.clampWhenFinished = true;
          }

          this.bodyMixer.addEventListener('finished', (e) => {
            if (this.bodyActions.jump && e.action === this.bodyActions.jump) {
              this.isJumpingAnim = false;
            }
          });
        }
      } else {
        const [tModel, walkClip, runClip] = await Promise.all([
          modelManager.getTerroristModel(),
          modelManager.getTerroristAnimation('Walking'),
          modelManager.getTerroristAnimation('Running'),
        ]);

        if (currentLoadId !== this.bodyModelLoadingId) return;

        model = tModel;
        while (this.playerBodyGroup.children.length > 0) {
          this.playerBodyGroup.remove(this.playerBodyGroup.children[0]);
        }
        // Rotate Terrorist model 180 degrees so it faces forward (-Z) in 3rd person!
        model.rotation.y = Math.PI;
        this.bodyModel = model;
        this.playerBodyGroup.add(model);

        if (model) {
          this.bodyMixer = new THREE.AnimationMixer(model);
          if (walkClip) this.bodyActions.walk = this.bodyMixer.clipAction(walkClip);
          if (runClip) this.bodyActions.jog = this.bodyMixer.clipAction(runClip);
        }
      }

      if (currentLoadId === this.bodyModelLoadingId) {
        this.updateThirdPersonWeapon();
      }
    } catch (e) {
      if (currentLoadId !== this.bodyModelLoadingId) return;
      console.warn('Could not load 3rd person player body model:', e);
      while (this.playerBodyGroup.children.length > 0) {
        this.playerBodyGroup.remove(this.playerBodyGroup.children[0]);
      }
      const fallback = modelManager.createFallbackCharacter(
        this.team === 'CT' ? 0x213752 : 0x8a4b28,
        this.team
      );
      this.playerBodyGroup.add(fallback);
      this.bodyModel = fallback;
    }
  }

  playJumpAnimation() {
    if (this.bodyActions && this.bodyActions.jump) {
      this.isJumpingAnim = true;
      if (this.currentAction && this.currentAction !== this.bodyActions.jump) {
        this.bodyActions.jump.reset();
        this.bodyActions.jump.setEffectiveTimeScale(1.0);
        this.bodyActions.jump.setEffectiveWeight(1.0);
        this.bodyActions.jump.crossFadeFrom(this.currentAction, 0.12, true);
        this.bodyActions.jump.play();
      } else {
        this.bodyActions.jump.reset().play();
      }
    }
  }

  fadeToAction(newAction, duration = 0.2) {
    if (!newAction || this.isJumpingAnim) return;
    if (this.currentAction === newAction) {
      if (!newAction.isRunning()) newAction.play();
      return;
    }
    const previousAction = this.currentAction;
    this.currentAction = newAction;
    if (previousAction && previousAction !== newAction) {
      previousAction.fadeOut(duration);
    }
    newAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(duration)
      .play();
  }

  async updateThirdPersonWeapon() {
    if (this.thirdPersonGunMesh) {
      this.playerBodyGroup.remove(this.thirdPersonGunMesh);
      this.thirdPersonGunMesh = null;
    }
    if (!this.activeWeapon) return;

    try {
      const gun = await modelManager.getWeaponModel(this.activeWeapon.id);
      if (gun) {
        gun.scale.setScalar(0.7);
        if (this.team === 'T') {
          gun.position.set(-0.22, 1.15, -0.28);
          gun.rotation.set(0, Math.PI / 2, 0);
        } else {
          gun.position.set(0.22, 1.15, 0.28);
          gun.rotation.set(0, -Math.PI / 2, 0);
        }
        this.playerBodyGroup.add(gun);
        this.thirdPersonGunMesh = gun;
      }
    } catch (e) {
      console.warn('Could not attach 3rd person weapon:', e);
    }
  }

  async loadWeapons() {
    for (const key of Object.keys(WEAPONS)) {
      try {
        const model = await modelManager.getWeaponModel(key);
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            if (child.material) {
              child.material.depthTest = true;
            }
          }
        });
        this.weaponModels.set(key, model);
        if (this.activeWeapon && this.activeWeapon.id === key) {
          this.updateActiveWeaponModel();
        }
      } catch (e) {
        console.warn(`Could not preload weapon ${key}:`, e);
      }
    }
  }

  updateActiveWeaponModel() {
    while (this.viewmodelContainer.children.length > 0) {
      this.viewmodelContainer.remove(this.viewmodelContainer.children[0]);
    }

    if (!this.activeWeapon) return;

    let model = this.weaponModels.get(this.activeWeapon.id);
    if (!model) {
      if (this.activeWeapon.category === 'pistol') model = modelManager.createFallbackPistol();
      else if (this.activeWeapon.category === 'smg') model = modelManager.createFallbackSMG();
      else if (this.activeWeapon.category === 'rifle') model = modelManager.createFallbackRifle();
      else model = modelManager.createTacticalKnife();
    }

    if (model) {
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      // Preserve calibrated model scale from ModelManager
      this.viewmodelContainer.add(model);

      if (this.activeWeapon.id === 'knife') {
        const anims = model.userData.animations;
        const animTarget = model.userData.innerModel || model;
        if (anims) {
          this.knifeMixer = new THREE.AnimationMixer(animTarget);
          this.knifeActions = {};
          if (anims.idle) {
            this.knifeActions.idle = this.knifeMixer.clipAction(anims.idle);
            this.knifeActions.idle.play();
            this.currentKnifeAction = this.knifeActions.idle;
          }
          ['swing1', 'swing2', 'swing3', 'swing4'].forEach(sw => {
            if (anims[sw]) {
              const act = this.knifeMixer.clipAction(anims[sw]);
              act.setLoop(THREE.LoopOnce, 1);
              act.clampWhenFinished = false; // Do NOT clamp: return cleanly to idle!
              this.knifeActions[sw] = act;
            }
          });

          // When swing finishes, smoothly return to idle animation
          this.knifeMixer.addEventListener('finished', (e) => {
            if (this.knifeActions && this.knifeActions.idle) {
              if (e.action && e.action !== this.knifeActions.idle) {
                e.action.fadeOut(0.12);
              }
              this.knifeActions.idle.reset().fadeIn(0.12).play();
              this.currentKnifeAction = this.knifeActions.idle;
            }
          });
        }
      } else {
        this.knifeMixer = null;
        this.knifeActions = {};
        this.currentKnifeAction = null;
      }
    }

    this.updateThirdPersonWeapon();
  }

  switchSlot(slot) {
    if (this.activeSlot === slot || !this.inventory[slot]) return;
    this.lastActiveSlot = this.activeSlot;
    this.activeSlot = slot;
    this.activeWeapon = this.inventory[slot];
    this.isReloading = false;
    this.updateActiveWeaponModel();
    soundManager.playDryFire();
    this.triggerStatsChange();
  }

  quickSwitch() {
    if (this.lastActiveSlot && this.inventory[this.lastActiveSlot]) {
      this.switchSlot(this.lastActiveSlot);
    }
  }

  buyWeapon(weaponId) {
    const data = WEAPONS[weaponId];
    if (!data) return false;
    if (this.money < data.price) {
      soundManager.playDenySound();
      return false;
    }

    this.money -= data.price;
    const instance = {
      ...data,
      ammo: data.magSize,
      reserve: data.maxReserve,
    };
    this.inventory[data.slot] = instance;
    this.switchSlot(data.slot);
    soundManager.playBuySound();
    this.triggerStatsChange();
    return true;
  }

  buyEquipment(equipId) {
    const data = EQUIPMENT[equipId];
    if (!data) return false;
    if (this.money < data.price) {
      soundManager.playDenySound();
      return false;
    }
    this.money -= data.price;
    this.armor = Math.max(this.armor, data.armor);
    if (data.hasHelmet) {
      this.hasHelmet = true;
    }
    soundManager.playBuySound();
    this.triggerStatsChange();
    return true;
  }

  reload() {
    if (this.isReloading || !this.activeWeapon || this.activeWeapon.slot === 3) return;
    if (this.activeWeapon.ammo >= this.activeWeapon.magSize || this.activeWeapon.reserve <= 0) {
      return;
    }
    this.isReloading = true;
    this.reloadStartTime = performance.now();
    soundManager.playReload();
  }

  tryFire() {
    if (!this.isLocked || this.isDead || !this.activeWeapon) return;
    const now = performance.now();
    const fireInterval = 1000 / this.activeWeapon.fireRate;

    if (now - this.lastShootTime < fireInterval) return;

    if (this.isReloading) {
      const elapsed = (now - this.reloadStartTime) / 1000;
      if (elapsed < this.activeWeapon.reloadTime) return;
      this.finishReload();
    }

    if (this.activeWeapon.id === 'knife') {
      this.lastShootTime = now;
      if (now - this.knifeLastClickTime > 1800) {
        this.knifeComboIndex = 0;
      }
      this.knifeLastClickTime = now;

      // Play combo swing with seamless bridging and zero delay
      const swingKey = 'swing' + (this.knifeComboIndex + 1);
      const action = this.knifeActions && this.knifeActions[swingKey];
      if (action) {
        if (this.currentKnifeAction && this.currentKnifeAction !== action) {
          this.currentKnifeAction.fadeOut(0.06);
        }
        if (this.knifeActions.idle && this.knifeActions.idle !== action) {
          this.knifeActions.idle.fadeOut(0.06);
        }
        action.reset();
        action.setEffectiveTimeScale(swingKey === 'swing4' ? 1.55 : 1.35);
        action.fadeIn(0.02); // Snappy instant trigger
        action.play();
        this.currentKnifeAction = action;
      }
      this.knifeComboIndex = (this.knifeComboIndex + 1) % 4;

      if (soundManager[this.activeWeapon.sound]) {
        soundManager[this.activeWeapon.sound]();
      }

      this.performRaycastShot();
      this.triggerStatsChange();
      return;
    }

    if (this.activeWeapon.magSize !== Infinity && this.activeWeapon.ammo <= 0) {
      soundManager.playDryFire();
      this.reload();
      this.lastShootTime = now;
      return;
    }

    this.lastShootTime = now;
    if (this.activeWeapon.magSize !== Infinity) {
      this.activeWeapon.ammo--;
    }

    if (soundManager[this.activeWeapon.sound]) {
      soundManager[this.activeWeapon.sound]();
    }

    // Recoil Kick
    const recoil = this.activeWeapon.recoil || 0.04;
    this.pitchObject.rotation.x += recoil * 0.4;
    this.yawObject.rotation.y += (Math.random() - 0.5) * recoil * 0.2;
    this.recoilOffset.z += 0.06;
    this.recoilOffset.y += 0.015;

    // Muzzle Flash
    this.muzzleLight.intensity = 3.5;
    setTimeout(() => {
      this.muzzleLight.intensity = 0;
    }, 45);

    this.performRaycastShot();
    this.triggerStatsChange();
  }

  finishReload() {
    if (!this.activeWeapon || !this.isReloading) return;
    const needed = this.activeWeapon.magSize - this.activeWeapon.ammo;
    const toLoad = Math.min(needed, this.activeWeapon.reserve);
    this.activeWeapon.ammo += toLoad;
    this.activeWeapon.reserve -= toLoad;
    this.isReloading = false;
    this.triggerStatsChange();
  }

  performRaycastShot() {
    let spread = this.activeWeapon.spreadBase || 0.005;
    const speed = this.velocity.length();
    if (speed > 1.0) spread += this.activeWeapon.spreadMovePenalty || 0.03;
    if (this.isCrouching) spread *= 0.6;
    if (this.isADS) spread *= 0.5;

    const raycaster = new THREE.Raycaster();
    const isKnife = this.activeWeapon.id === 'knife';
    const screenCenter = new THREE.Vector2(
      isKnife ? 0 : (Math.random() - 0.5) * spread * 2,
      isKnife ? 0 : (Math.random() - 0.5) * spread * 2
    );
    raycaster.setFromCamera(screenCenter, this.camera);
    if (isKnife) {
      raycaster.far = this.activeWeapon.range || 3.25;
    }

    if (this.onShoot) {
      this.onShoot(raycaster, this.activeWeapon);
    }
  }

  takeDamage(amount, attackerName = 'Enemy', hitType = 'body') {
    if (this.isDead) return;

    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = dmg * 0.5;
      this.armor = Math.max(0, this.armor - absorbed);
      dmg -= absorbed;
    }

    this.health = Math.max(0, this.health - dmg);
    soundManager.playHitmarker();

    if (this.health <= 0) {
      this.die(attackerName);
    }
    this.triggerStatsChange();
  }

  die(killerName) {
    this.isDead = true;
    this.health = 0;
    soundManager.playRoundLost();
    if (this.onKill) {
      this.onKill(killerName, 'Player', false);
    }
  }

  respawn(spawnPos) {
    this.isDead = false;
    this.health = this.maxHealth;
    this.armor = 100;
    this.hasHelmet = true;
    this.velocity.set(0, 0, 0);
    this.yawObject.position.copy(spawnPos);
    this.pitchObject.rotation.set(0, 0, 0);
    this.isReloading = false;
    if (!this.bodyModel || this.lastLoadedTeam !== this.team) {
      this.loadPlayerBodyModel();
    }
    this.triggerStatsChange();
  }

  triggerStatsChange() {
    if (this.onStatsChange) {
      this.onStatsChange({
        health: Math.round(this.health),
        armor: Math.round(this.armor),
        hasHelmet: this.hasHelmet,
        money: this.money,
        ammo: this.activeWeapon ? this.activeWeapon.ammo : 0,
        reserve: this.activeWeapon ? this.activeWeapon.reserve : 0,
        weaponName: this.activeWeapon ? this.activeWeapon.name : 'None',
        weaponId: this.activeWeapon ? this.activeWeapon.id : '',
        inBuyZone: this.mapManager.isInBuyZone(this.yawObject.position, this.team),
        isReloading: this.isReloading,
        isADS: this.isADS,
        isThirdPerson: this.isThirdPerson,
        isRunning: this.isRunning,
      });
    }
  }

  update(delta) {
    if (this.isDead) return;

    if (this.isMouseDown && this.activeWeapon && this.activeWeapon.isAutomatic) {
      this.tryFire();
    }

    if (this.isReloading) {
      const elapsed = (performance.now() - this.reloadStartTime) / 1000;
      if (elapsed >= this.activeWeapon.reloadTime) {
        this.finishReload();
      }
    }

    this.isCrouching = this.keys.ControlLeft;
    this.isRunning = this.keys.ShiftLeft || this.keys.ShiftRight;

    // Default: Walking speed (4.3 m/s). Shift activates Running (7.6 m/s). Crouch is 1.9 m/s.
    let baseSpeed = this.isRunning ? 7.6 : 4.3;
    if (this.activeWeapon) baseSpeed *= this.activeWeapon.mobility || 1.0;
    if (this.isCrouching) baseSpeed = (this.activeWeapon && this.activeWeapon.id === 'knife') ? 2.4 : 1.9;

    const targetHeight = this.isCrouching ? this.crouchHeight : this.standHeight;
    this.currentHeight = THREE.MathUtils.lerp(this.currentHeight, targetHeight, delta * 12);
    this.pitchObject.position.y = this.currentHeight;

    const moveDir = new THREE.Vector3();
    if (this.keys.KeyW) moveDir.z -= 1;
    if (this.keys.KeyS) moveDir.z += 1;
    if (this.keys.KeyA) moveDir.x -= 1;
    if (this.keys.KeyD) moveDir.x += 1;
    moveDir.normalize();

    moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yawObject.rotation.y);

    const friction = this.onGround ? 8.5 : 1.2;
    this.velocity.x -= this.velocity.x * friction * delta;
    this.velocity.z -= this.velocity.z * friction * delta;

    this.velocity.x += moveDir.x * baseSpeed * 12 * delta;
    this.velocity.z += moveDir.z * baseSpeed * 12 * delta;

    if (this.onGround) {
      if (this.keys.Space && !this.isCrouching) {
        this.velocity.y = 5.2;
        this.onGround = false;
        soundManager.playFootstep();
        this.playJumpAnimation();
      } else {
        this.velocity.y = 0;
      }
    } else {
      this.velocity.y -= 18.0 * delta;
    }

    const nextPos = this.yawObject.position.clone();
    nextPos.x += this.velocity.x * delta;
    nextPos.z += this.velocity.z * delta;
    nextPos.y += this.velocity.y * delta;

    const groundY = this.mapManager ? this.mapManager.getGroundHeight(nextPos.x, nextPos.z, nextPos.y) : 0;

    // Step-down snapping when walking down ramps or slopes (keeps player grounded)
    const isSteppingDown = this.onGround && !this.keys.Space && (nextPos.y >= groundY) && (nextPos.y - groundY <= 0.75);

    if (nextPos.y <= groundY || isSteppingDown) {
      if (!this.onGround) {
        this.isJumpingAnim = false;
      }
      nextPos.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    this.resolveCollisions(nextPos);

    // Hard boundary clamping to Dust II walkable area
    nextPos.x = Math.max(-23.5, Math.min(47.5, nextPos.x));
    nextPos.z = Math.max(-80.0, Math.min(26.5, nextPos.z));

    // Void fall safety net: if falling below ground level or outside bounds, teleport to team spawn
    if (nextPos.y < -4.5 || nextPos.x < -24.0 || nextPos.x > 48.0 || nextPos.z < -81.0 || nextPos.z > 27.5) {
      const safeSpawn = this.team === 'CT'
        ? (this.mapManager && this.mapManager.spawnPointsCT && this.mapManager.spawnPointsCT[0] ? this.mapManager.spawnPointsCT[0] : new THREE.Vector3(11.38, 2.44, -43.89))
        : (this.mapManager && this.mapManager.spawnPointsT && this.mapManager.spawnPointsT[0] ? this.mapManager.spawnPointsT[0] : new THREE.Vector3(-18.69, 3.25, 22.76));
      nextPos.copy(safeSpawn);
      this.velocity.set(0, 0, 0);
      this.onGround = true;
    }

    this.yawObject.position.copy(nextPos);

    const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

    // Update knife viewmodel animations
    if (this.knifeMixer) {
      this.knifeMixer.update(delta);
      if (this.knifeComboIndex > 0 && performance.now() - this.knifeLastClickTime > 1800) {
        this.knifeComboIndex = 0;
      }
    }

    // Update 3rd person / body animations
    if (this.bodyMixer) {
      this.bodyMixer.update(delta);
    }

    if (this.bodyActions) {
      if (this.isJumpingAnim || !this.onGround) {
        // Jumping clip takes precedence
      } else if (horizontalSpeed > 0.4) {
        // Walk is default, Shift activates jog/run
        if (this.isRunning && this.bodyActions.jog) {
          this.fadeToAction(this.bodyActions.jog, 0.2);
        } else if (this.bodyActions.walk) {
          this.fadeToAction(this.bodyActions.walk, 0.2);
        }
      } else {
        // Idle
        if (this.currentAction && this.currentAction !== this.bodyActions.jump) {
          this.currentAction.fadeOut(0.25);
          this.currentAction = null;
        }
      }
    }

    // Footsteps timing: faster when running
    const footstepRate = this.isRunning ? 3.8 : 2.5;
    if (this.onGround && horizontalSpeed > 0.8) {
      this.bobTimer += delta * horizontalSpeed * footstepRate;
      if (this.bobTimer > Math.PI) {
        this.bobTimer -= Math.PI;
        soundManager.playFootstep();
      }
    }

    const recovery = (this.activeWeapon ? this.activeWeapon.recoilRecovery : 5.0) * delta;
    this.recoilOffset.lerp(new THREE.Vector3(), recovery * 1.5);
    this.swayRot.lerp(new THREE.Vector3(), delta * 8);

    // Viewmodel or 3rd Person Camera
    if (this.isThirdPerson) {
      this.updateThirdPersonCamera(delta);
    } else {
      this.updateViewmodel(delta, horizontalSpeed);
    }

    this.triggerStatsChange();
  }

  updateThirdPersonCamera(delta) {
    // Over the right shoulder tactical third person
    const targetCamOffset = new THREE.Vector3(0.55, 0.22, 2.1);
    this.camera.position.lerp(targetCamOffset, delta * 16);

    // Dynamic FOV zoom on ADS
    const targetFOV = this.isADS ? 50 : 75;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, delta * 14);
    this.camera.updateProjectionMatrix();
  }

  updateViewmodel(delta, speed) {
    if (!this.activeWeapon) return;

    const basePos = this.isADS && this.activeWeapon.adsPosition
      ? this.activeWeapon.adsPosition
      : this.activeWeapon.position;

    const baseRot = this.activeWeapon.rotation;

    const bobX = Math.cos(this.bobTimer) * 0.006 * (speed / 6);
    const bobY = Math.sin(this.bobTimer * 2) * 0.006 * (speed / 6);

    let reloadDip = 0;
    if (this.isReloading) {
      const p = (performance.now() - this.reloadStartTime) / (this.activeWeapon.reloadTime * 1000);
      reloadDip = Math.sin(p * Math.PI) * 0.12;
    }

    const targetPos = new THREE.Vector3(
      basePos[0] + bobX + this.recoilOffset.x,
      basePos[1] + bobY - reloadDip + this.recoilOffset.y,
      basePos[2] + this.recoilOffset.z
    );

    this.viewmodelContainer.position.lerp(targetPos, delta * 18);

    this.viewmodelContainer.rotation.set(
      baseRot[0] + this.swayRot.x + (this.isReloading ? 0.35 : 0),
      baseRot[1] + this.swayRot.y,
      baseRot[2]
    );

    const targetFOV = this.isADS ? 52 : 75;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, delta * 14);
    this.camera.updateProjectionMatrix();
  }

  resolveCollisions(pos) {
    const r = this.playerRadius;
    const stepHeight = 0.45; // Obstacles below stepHeight are ground/stairs/ramps, NOT blocking walls

    // High-precision circle-to-segment collision with authentic BSP wall normals
    const segments = this.mapManager ? this.mapManager.wallSegments : null;
    if (segments && segments.length > 0) {
      for (let i = 0; i < segments.length; i++) {
        const w = segments[i];
        if (pos.y + 1.8 <= w.minY || pos.y + stepHeight >= w.maxY) continue;

        const x1 = w.p1[0], z1 = w.p1[1];
        const x2 = w.p2[0], z2 = w.p2[1];
        const dx = x2 - x1, dz = z2 - z1;
        const lenSq = dx * dx + dz * dz;
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
}
