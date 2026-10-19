import * as THREE from 'three';
import { MapManager } from './MapManager.js';
import { Player } from './Player.js';
import { BotManager } from './BotManager.js';
import { FXManager } from './FXManager.js';
import { soundManager } from './SoundManager.js';

export class Game {
  constructor(canvasContainer) {
    this.container = canvasContainer;

    // Three.js Core with camera near plane = 0.01 to ensure first person viewmodels never clip
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.01,
      250
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Systems
    this.mapManager = new MapManager(this.scene);
    this.playerTeam = 'CT'; // Default, selectable by user
    this.player = new Player(this.camera, this.scene, this.renderer.domElement, this.mapManager, this.playerTeam);
    this.botManager = new BotManager(this.scene, this.mapManager);
    this.botManager.setBotTeam(this.playerTeam === 'CT' ? 'T' : 'CT');
    this.fxManager = new FXManager(this.scene);

    // Match / Round State
    this.roundTime = 115;
    this.currentTimer = this.roundTime;
    this.currentRound = 1;
    this.ctScore = 0;
    this.tScore = 0;
    this.isRoundOver = false;
    this.roundWinner = null;
    this.botCount = 4;

    // High precision timing
    this.lastTime = performance.now();

    // UI Event hooks
    this.onUIUpdate = null;
    this.onKillFeed = null;
    this.onRoundEnd = null;

    this.setupShootingHooks();
    this.startRound();

    window.addEventListener('resize', () => this.onWindowResize());
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setPlayerTeam(team) {
    this.playerTeam = team;
    this.player.team = team;
    this.botManager.setBotTeam(team === 'CT' ? 'T' : 'CT');
    this.startRound();
  }

  setupShootingHooks() {
    this.player.onShoot = (raycaster, weapon) => {
      // Alert nearby enemy bots to player gunshot sound (unless melee knife)
      if (weapon.category !== 'melee') {
        this.botManager.alertGunshot(this.player.yawObject.position);
      }

      // Calculate accurate muzzle origin position (from weapon barrel in both 1st and 3rd person)
      const muzzlePos = new THREE.Vector3();
      const camDir = new THREE.Vector3();
      this.player.camera.getWorldDirection(camDir);

      if (this.player.isThirdPerson && this.player.thirdPersonGunMesh) {
        this.player.thirdPersonGunMesh.getWorldPosition(muzzlePos);
        muzzlePos.addScaledVector(camDir, 0.35);
      } else {
        // First-person viewmodel barrel position
        muzzlePos.set(0.20, -0.16, -0.45);
        muzzlePos.applyMatrix4(this.player.camera.matrixWorld);
      }

      const botHitboxes = this.botManager.getAllHitboxes();
      const targets = this.mapManager.targets.map((t) => t.children[0]).filter(Boolean);
      const mapMeshes = this.mapManager.mapGroup ? this.mapManager.mapGroup.children : [];

      const allIntersects = raycaster.intersectObjects([
        ...botHitboxes,
        ...targets,
        ...mapMeshes,
      ], true);

      let hitBot = null;
      let hitPart = 'body';
      let hitMultiplier = 1.0;
      let hitPoint = null;
      let isHeadshot = false;

      // 1. Direct raycast hit on bot
      if (allIntersects.length > 0) {
        for (let i = 0; i < allIntersects.length; i++) {
          const item = allIntersects[i];
          if (item.object && item.object.userData && item.object.userData.bot && !item.object.userData.bot.isDead) {
            hitBot = item.object.userData.bot;
            hitPart = item.object.userData.part || 'body';
            isHeadshot = hitPart === 'head';
            hitMultiplier = item.object.userData.multiplier || 1.0;
            hitPoint = item.point;
            break;
          }
          if (weapon.category !== 'melee') break;
        }
      }

      // 2. If melee and direct ray didn't hit bot, perform authentic melee sweep in front of player
      if (weapon.category === 'melee' && !hitBot) {
        const playerEye = this.player.camera.getWorldPosition(new THREE.Vector3());
        let closestDist = Infinity;
        const meleeReach = 3.25;

        for (const bot of this.botManager.bots) {
          if (bot.isDead) continue;
          const botTorso = bot.group.position.clone();
          botTorso.y += 1.35;

          const dist = playerEye.distanceTo(botTorso);
          if (dist <= meleeReach) {
            const toBot = new THREE.Vector3().subVectors(botTorso, playerEye).normalize();
            const dot = camDir.dot(toBot);
            // Within ~65-degree forward striking arc
            if (dot > 0.42 && dist < closestDist) {
              closestDist = dist;
              hitBot = bot;
              hitPart = 'body';
              isHeadshot = false;
              hitMultiplier = 1.0;
              hitPoint = botTorso;
            }
          }
        }
      }

      // 3. Process bot hit
      if (hitBot) {
        let finalDamage = Math.round(weapon.damage * hitMultiplier);

        if (weapon.category === 'melee') {
          // Check lethal backstab angle
          const playerDir = new THREE.Vector3();
          this.player.camera.getWorldDirection(playerDir);
          playerDir.y = 0;
          playerDir.normalize();

          const botDir = new THREE.Vector3();
          hitBot.group.getWorldDirection(botDir);
          botDir.y = 0;
          botDir.normalize();

          const dot = playerDir.dot(botDir);
          if (dot > 0.35) {
            finalDamage = 130; // Fatal backstab!
          }
        }

        if (isHeadshot) {
          soundManager.playHeadshotDink();
          this.fxManager.createHeadshotSparks(hitPoint || hitBot.group.position);
        } else {
          if (weapon.category === 'melee') {
            soundManager.playKnifeHit();
          } else {
            soundManager.playHitmarker();
          }
          this.fxManager.createBloodImpact(hitPoint || hitBot.group.position);
        }

        const remHp = hitBot.takeDamage(finalDamage, isHeadshot, 'Player');

        if (remHp <= 0) {
          const reward = weapon.category === 'melee' ? 1500 : 300;
          this.player.money = Math.min(16000, this.player.money + reward);
          if (this.onKillFeed) {
            this.onKillFeed({
              killer: 'Player',
              victim: hitBot.name,
              weapon: weapon.name,
              isHeadshot: isHeadshot,
            });
          }
          this.checkRoundStatus();
        }
        return;
      }

      // 4. Otherwise handle targets, walls, and misses
      if (allIntersects.length > 0) {
        const hit = allIntersects[0];
        const hitPoint = hit.point;

        if (hit.object.name === 'Target_Bullseye') {
          const targetGroup = hit.object.parent;
          this.mapManager.hitTarget(targetGroup);
          soundManager.playHitmarker();
          this.fxManager.createSparkImpact(hitPoint, hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0));
        } else {
          if (weapon.category !== 'melee') {
            this.fxManager.createTracer(muzzlePos, hitPoint);
            soundManager.playImpactWall();
            const norm = hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0);
            this.fxManager.createSparkImpact(hitPoint, norm);
          } else {
            soundManager.playKnifeHit();
          }
        }
      } else {
        if (weapon.category !== 'melee') {
          const farPoint = muzzlePos.clone().addScaledVector(camDir, 90);
          this.fxManager.createTracer(muzzlePos, farPoint);
        }
      }
    };

    this.onBotFire = (bot, muzzlePos, targetPos) => {
      this.fxManager.createTracer(muzzlePos, targetPos, 0xff7744);
    };

    this.player.onKill = (killer, victim, isHeadshot) => {
      if (this.onKillFeed) {
        this.onKillFeed({
          killer: killer,
          victim: victim,
          weapon: 'M16A3',
          isHeadshot: isHeadshot,
        });
      }
      this.checkRoundStatus();
    };
  }

  startRound() {
    this.isRoundOver = false;
    this.roundWinner = null;
    this.currentTimer = this.roundTime;

    // Spawn player at proper Dust 2 base
    const spawnPoints = this.playerTeam === 'CT'
      ? this.mapManager.spawnPointsCT
      : this.mapManager.spawnPointsT;
    const spawnPos = (spawnPoints && spawnPoints.length > 0)
      ? spawnPoints[0].clone()
      : (this.playerTeam === 'CT' ? new THREE.Vector3(11.38, 2.44, -43.89) : new THREE.Vector3(-18.69, 3.25, 22.76));

    this.player.respawn(spawnPos);

    // Spawn opposing bots
    this.botManager.setBotTeam(this.playerTeam === 'CT' ? 'T' : 'CT');
    this.botManager.spawnBots(this.botCount);

    if (this.onRoundEnd) {
      this.onRoundEnd(null);
    }
  }

  checkRoundStatus() {
    if (this.isRoundOver) return;

    const aliveBots = this.botManager.getAliveBotCount();

    if (this.playerTeam === 'CT') {
      if (aliveBots === 0) {
        this.endRound('CT');
      } else if (this.player.isDead) {
        this.endRound('T');
      }
    } else {
      // Player is Terrorist
      if (aliveBots === 0) {
        this.endRound('T');
      } else if (this.player.isDead) {
        this.endRound('CT');
      }
    }
  }

  endRound(winner) {
    this.isRoundOver = true;
    this.roundWinner = winner;

    const isPlayerWin = winner === this.playerTeam;

    if (winner === 'CT') {
      this.ctScore++;
    } else {
      this.tScore++;
    }

    if (isPlayerWin) {
      this.player.money = Math.min(16000, this.player.money + 3250);
      soundManager.playRoundWin();
    } else {
      this.player.money = Math.min(16000, this.player.money + 1400);
      soundManager.playRoundLost();
    }

    if (this.onRoundEnd) {
      this.onRoundEnd(winner);
    }

    setTimeout(() => {
      this.currentRound++;
      this.startRound();
    }, 5000);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (!this.isRoundOver) {
      this.currentTimer = Math.max(0, this.currentTimer - delta);
      if (this.currentTimer <= 0) {
        // Time expired: Counter-Terrorists win
        this.endRound('CT');
      }
    }

    this.player.update(delta);
    this.botManager.update(delta, this.player, this.onBotFire);
    this.fxManager.update(delta);

    this.renderer.render(this.scene, this.camera);

    if (this.onUIUpdate) {
      this.onUIUpdate({
        timer: Math.ceil(this.currentTimer),
        ctScore: this.ctScore,
        tScore: this.tScore,
        currentRound: this.currentRound,
        aliveBots: this.botManager.getAliveBotCount(),
        totalBots: this.botCount,
        playerTeam: this.playerTeam,
      });
    }
  }
}
