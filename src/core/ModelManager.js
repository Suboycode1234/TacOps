import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

class ModelManager {
  constructor() {
    this.fbxLoader = new FBXLoader();
    this.textureLoader = new THREE.TextureLoader();
    this.cache = new Map();
    this.textures = new Map();
    this.loadingPromises = new Map();
    this.animations = new Map();
  }

  loadTexture(path) {
    if (this.textures.has(path)) {
      return this.textures.get(path);
    }
    const tex = this.textureLoader.load(
      path,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
      },
      undefined,
      (err) => {
        console.warn(`[ModelManager] Could not load texture ${path}:`, err);
      }
    );
    this.textures.set(path, tex);
    return tex;
  }

  async loadFBX(url) {
    if (this.cache.has(url)) {
      const cached = this.cache.get(url);
      return SkeletonUtils.clone(cached);
    }
    if (this.loadingPromises.has(url)) {
      const base = await this.loadingPromises.get(url);
      return SkeletonUtils.clone(base);
    }

    const promise = new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (fbx) => {
          fbx.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          this.cache.set(url, fbx);
          resolve(fbx);
        },
        undefined,
        (err) => {
          console.warn(`[ModelManager] Failed loading FBX at ${url}:`, err);
          reject(err);
        }
      );
    });

    this.loadingPromises.set(url, promise);
    const loaded = await promise;
    return SkeletonUtils.clone(loaded);
  }

  // Build / Load Counter-Terrorist (New Meshy Tactical Gas Mask Soldier with Blender Rig)
  async getCounterTerroristModel() {
    try {
      // Use the rigged CT model with Blender armature
      const model = await this.loadFBX('/models/Animations/CounterTerrorist/walk_loop_blender_fit.fbx');

      // Load 4K PBR textures from Meshy AI Tactical Gas Mask Soldier
      const colorTex = this.loadTexture('/models/CounterTerrorist/Meshy_AI_Tactical_Gas_Mask_Sol_1018141402_texture.png');
      const normalTex = this.loadTexture('/models/CounterTerrorist/Meshy_AI_Tactical_Gas_Mask_Sol_1018141402_texture_normal.png');
      const roughTex = this.loadTexture('/models/CounterTerrorist/Meshy_AI_Tactical_Gas_Mask_Sol_1018141402_texture_roughness.png');
      const metalTex = this.loadTexture('/models/CounterTerrorist/Meshy_AI_Tactical_Gas_Mask_Sol_1018141402_texture_metallic.png');

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.material = new THREE.MeshStandardMaterial({
            map: colorTex,
            normalMap: normalTex,
            roughnessMap: roughTex,
            metalnessMap: metalTex,
            roughness: 0.65,
            metalness: 0.35,
          });
        }
      });

      this.normalizeCharacterScale(model, 1.82);
      return model;
    } catch (e) {
      console.warn('Fallback CT model used:', e);
      return this.createFallbackCharacter(0x213752, 'CT');
    }
  }

  makeClipInPlace(clip, rootNames = ['root', 'Armature']) {
    if (!clip || !clip.tracks) return clip;
    const inPlaceTracks = [];
    for (const track of clip.tracks) {
      const isRootPos = rootNames.some((r) => track.name === `${r}.position`);
      if (isRootPos) {
        // Zero out horizontal (X, Z) translation drift while preserving vertical hip sway
        const values = Array.from(track.values);
        const firstX = values[0];
        const firstZ = values[2];
        for (let i = 0; i < values.length; i += 3) {
          values[i] = firstX;
          values[i + 2] = firstZ;
        }
        const TrackType = track.constructor;
        inPlaceTracks.push(new TrackType(track.name, track.times, values));
      } else {
        inPlaceTracks.push(track);
      }
    }
    return new THREE.AnimationClip(clip.name, clip.duration, inPlaceTracks);
  }

  // Preload and retrieve Counter-Terrorist animation clips (walk, jog, merged jump)
  async getCTAnimation(type = 'walk') {
    const key = `ct_${type}`;
    if (this.animations.has(key)) {
      return this.animations.get(key);
    }

    try {
      if (type === 'jump') {
        // Merge jump_start and jump_land into a single seamless jump animation clip
        const startFbx = await this.loadFBX('/models/Animations/CounterTerrorist/jump_start_blender_fit.fbx');
        const landFbx = await this.loadFBX('/models/Animations/CounterTerrorist/jump_land_blender_fit.fbx');

        const startClip = startFbx.animations && startFbx.animations[0];
        const landClip = landFbx.animations && landFbx.animations[0];

        if (startClip && landClip) {
          const mergedClip = this.mergeJumpClips(startClip, landClip);
          const inPlaceClip = this.makeClipInPlace(mergedClip, ['root', 'Armature']);
          this.animations.set(key, inPlaceClip);
          return inPlaceClip;
        }
      } else if (type === 'jog') {
        const fbx = await this.loadFBX('/models/Animations/CounterTerrorist/jog_fwd_loop_blender_fit.fbx');
        if (fbx.animations && fbx.animations.length > 0) {
          const clip = this.makeClipInPlace(fbx.animations[0], ['root', 'Armature']);
          clip.name = 'jog';
          this.animations.set(key, clip);
          return clip;
        }
      } else {
        // walk
        const fbx = await this.loadFBX('/models/Animations/CounterTerrorist/walk_loop_blender_fit.fbx');
        if (fbx.animations && fbx.animations.length > 0) {
          const clip = this.makeClipInPlace(fbx.animations[0], ['root', 'Armature']);
          clip.name = 'walk';
          this.animations.set(key, clip);
          return clip;
        }
      }
    } catch (e) {
      console.warn(`Could not load CT animation ${type}:`, e);
    }
    return null;
  }

  // Merge jump_start and jump_land keyframe tracks into a single unified jumping clip
  mergeJumpClips(startClip, landClip) {
    const mergedTracks = [];
    const startDuration = startClip.duration;
    const landTracksMap = new Map();
    landClip.tracks.forEach((t) => landTracksMap.set(t.name, t));

    startClip.tracks.forEach((startTrack) => {
      const landTrack = landTracksMap.get(startTrack.name);
      if (!landTrack) {
        mergedTracks.push(startTrack.clone());
        return;
      }

      const timesA = Array.from(startTrack.times);
      const valuesA = Array.from(startTrack.values);

      // Shift land track keyframe timestamps after start track duration
      const timesB = Array.from(landTrack.times).map((t) => t + startDuration);
      const valuesB = Array.from(landTrack.values);

      const mergedTimes = timesA.concat(timesB);
      const mergedValues = valuesA.concat(valuesB);

      const TrackType = startTrack.constructor;
      mergedTracks.push(new TrackType(startTrack.name, mergedTimes, mergedValues));
    });

    const totalDuration = startDuration + landClip.duration;
    return new THREE.AnimationClip('jump', totalDuration, mergedTracks);
  }

  // Build / Load Terrorist
  async getTerroristModel() {
    try {
      const model = await this.loadFBX('/models/Terrorist/Counter Strike Terror.fbx');
      const bodyTex = this.loadTexture('/models/Terrorist/Terrorist_Working1.png');
      const bagTex = this.loadTexture('/models/Terrorist/Backpack1.png');

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const name = (child.name || '').toLowerCase();
          const mat = new THREE.MeshStandardMaterial({
            roughness: 0.7,
            metalness: 0.15,
          });
          if (name.includes('bomb') || name.includes('bag') || name.includes('pack')) {
            mat.map = bagTex;
          } else {
            mat.map = bodyTex;
          }
          child.material = mat;
        }
      });

      this.normalizeCharacterScale(model, 1.82);
      // Natively faces forward (-Z); no rotation needed
      model.rotation.y = 0;
      return model;
    } catch (e) {
      console.warn('Fallback T model used:', e);
      const fallback = this.createFallbackCharacter(0x8a4b28, 'T');
      return fallback;
    }
  }

  // Preload and retrieve Terrorist animation clip (Walking, Running)
  async getTerroristAnimation(name = 'Walking') {
    if (this.animations.has(name)) {
      return this.animations.get(name);
    }
    try {
      const fbx = await this.loadFBX(`/models/Animations/Terrorist/${name}.fbx`);
      if (fbx.animations && fbx.animations.length > 0) {
        const clip = this.makeClipInPlace(fbx.animations[0], ['Armature', 'root']);
        clip.name = name;
        this.animations.set(name, clip);
        return clip;
      }
    } catch (e) {
      console.warn(`Could not load animation ${name}:`, e);
    }
    return null;
  }

  normalizeCharacterScale(model, targetHeight = 1.82) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0.001) {
      const scaleFactor = targetHeight / size.y;
      model.scale.multiplyScalar(scaleFactor);

      const newBox = new THREE.Box3().setFromObject(model);
      model.position.y -= newBox.min.y;
    }
  }

  // Load Weapon Model (M16, Deagle, P90, Knife)
  async getWeaponModel(weaponId) {
    if (weaponId === 'knife') {
      return this.getKnifeModel();
    }

    if (weaponId === 'deagle') {
      try {
        const model = await this.loadFBX('/models/Guns/GoldenEagle/Deagle_CS2.fbx');
        const colorTex = this.loadTexture('/models/Guns/GoldenEagle/deagle_default_color.png');
        const normalTex = this.loadTexture('/models/Guns/GoldenEagle/deagle_default_normal_tga_f25ac800.png');
        const roughTex = this.loadTexture('/models/Guns/GoldenEagle/deagle_default_rough.png');

        model.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              map: colorTex,
              normalMap: normalTex,
              roughnessMap: roughTex,
              roughness: 0.35,
              metalness: 0.85,
            });
          }
        });
        return this.fitWeaponToStandardSize(model, 0.28);
      } catch (e) {
        console.warn('Fallback Deagle viewmodel:', e);
        return this.createFallbackPistol();
      }
    }

    if (weaponId === 'm16') {
      try {
        const model = await this.loadFBX('/models/Guns/Rifle/m16a3.fbx');
        const colorTex = this.loadTexture('/models/Guns/Rifle/m16_M16A3_BaseColor.png');
        const normalTex = this.loadTexture('/models/Guns/Rifle/m16_M16A3_Normal.png');
        const roughTex = this.loadTexture('/models/Guns/Rifle/m16_M16A3_Roughness.png');
        const metalTex = this.loadTexture('/models/Guns/Rifle/m16_M16A3_Metallic.png');

        model.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              map: colorTex,
              normalMap: normalTex,
              roughnessMap: roughTex,
              metalnessMap: metalTex,
              roughness: 0.45,
              metalness: 0.75,
            });
          }
        });
        return this.fitWeaponToStandardSize(model, 0.85);
      } catch (e) {
        console.warn('Fallback M16 viewmodel:', e);
        return this.createFallbackRifle();
      }
    }

    if (weaponId === 'p90') {
      try {
        const model = await this.loadFBX('/models/Guns/P90/P90All_Modules.FBX');
        const albedoBody = this.loadTexture('/models/Guns/P90/P90All_Modules_Albedo.P90Body.png');
        const normBody = this.loadTexture('/models/Guns/P90/P90All_Modules_Normal.P90Body.png');
        const roughBody = this.loadTexture('/models/Guns/P90/P90All_Modules_Roughness.P90Body.png');

        model.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              map: albedoBody,
              normalMap: normBody,
              roughnessMap: roughBody,
              roughness: 0.5,
              metalness: 0.6,
            });
          }
        });
        return this.fitWeaponToStandardSize(model, 0.58);
      } catch (e) {
        console.warn('Fallback P90 viewmodel:', e);
        return this.createFallbackSMG();
      }
    }

    return this.createFallbackPistol();
  }

  fitWeaponToStandardSize(model, targetLength = 0.7) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0.001) {
      const scale = targetLength / maxDim;
      model.scale.multiplyScalar(scale);

      const center = new THREE.Vector3();
      const newBox = new THREE.Box3().setFromObject(model);
      newBox.getCenter(center);
      model.position.sub(center);

      const pivot = new THREE.Group();
      pivot.add(model);
      return pivot;
    }
    return model;
  }

  createFallbackPistol() {
    const group = new THREE.Group();
    const slideMat = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.35, metalness: 0.85 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.7, metalness: 0.3 });

    // Slide & Barrel
    const slideGeo = new THREE.BoxGeometry(0.045, 0.055, 0.24);
    const slide = new THREE.Mesh(slideGeo, slideMat);
    slide.position.set(0, 0.035, -0.06);
    group.add(slide);

    // Frame & Grip
    const gripGeo = new THREE.BoxGeometry(0.04, 0.13, 0.06);
    const grip = new THREE.Mesh(gripGeo, frameMat);
    grip.position.set(0, -0.05, 0.02);
    grip.rotation.x = 0.22;
    group.add(grip);

    // Trigger guard
    const guardGeo = new THREE.BoxGeometry(0.02, 0.03, 0.05);
    const guard = new THREE.Mesh(guardGeo, slideMat);
    guard.position.set(0, -0.015, -0.02);
    group.add(guard);

    return group;
  }

  createFallbackSMG() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.5, metalness: 0.5 });

    // Bullpup Body
    const bodyGeo = new THREE.BoxGeometry(0.08, 0.16, 0.44);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0, -0.08);
    group.add(body);

    // Top rail / Magazine
    const magGeo = new THREE.BoxGeometry(0.065, 0.03, 0.26);
    const magMat = new THREE.MeshStandardMaterial({ color: 0x383e47, roughness: 0.4, metalness: 0.6 });
    const mag = new THREE.Mesh(magGeo, magMat);
    mag.position.set(0, 0.095, -0.06);
    group.add(mag);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8);
    const barrel = new THREE.Mesh(barrelGeo, bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.36);
    group.add(barrel);

    return group;
  }

  createFallbackRifle() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x24282e, roughness: 0.45, metalness: 0.75 });
    const stockMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.8, metalness: 0.2 });

    // Receiver
    const recGeo = new THREE.BoxGeometry(0.055, 0.09, 0.32);
    const rec = new THREE.Mesh(recGeo, bodyMat);
    rec.position.set(0, 0.02, -0.06);
    group.add(rec);

    // Barrel & Handguard
    const barrelGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.38, 8);
    const barrel = new THREE.Mesh(barrelGeo, bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.035, -0.40);
    group.add(barrel);

    // Curved Magazine
    const magGeo = new THREE.BoxGeometry(0.035, 0.16, 0.07);
    const mag = new THREE.Mesh(magGeo, stockMat);
    mag.position.set(0, -0.10, -0.08);
    mag.rotation.x = 0.2;
    group.add(mag);

    // Stock
    const stockGeo = new THREE.BoxGeometry(0.048, 0.11, 0.22);
    const stock = new THREE.Mesh(stockGeo, stockMat);
    stock.position.set(0, 0, 0.21);
    group.add(stock);

    return group;
  }

  
  // Load Animated Tactical Combat Knife with full arms and 5 split animations
  async getKnifeModel() {
    try {
      const model = await this.loadFBX('/models/Guns/Knife/Animations/Idle/source/arms@knife_idle.fbx');
      const armColor = this.loadTexture('/models/Guns/Knife/Animations/Idle/textures/armcolor3.png');
      const armAO = this.loadTexture('/models/Guns/Knife/Animations/Idle/textures/armAO3.png');
      const armNormal = this.loadTexture('/models/Guns/Knife/Animations/Idle/textures/armNormal3.png');
      const armRough = this.loadTexture('/models/Guns/Knife/Animations/Idle/textures/armroughness3.png');

      const knifeColor = this.loadTexture('/models/Guns/Knife/Animations/Idle/textures/knifeColor.png');
      const knifeMetal = this.loadTexture('/models/Guns/Knife/Animations/Idle/textures/knifeMetallic.png');
      const knifeNormal = this.loadTexture('/models/Guns/Knife/Animations/Idle/textures/knifeNormal.png');
      const knifeRough = this.loadTexture('/models/Guns/Knife/Animations/Idle/textures/knifeRoughness.png');

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          const name = child.name.toLowerCase();
          if (name.includes('knife')) {
            child.material = new THREE.MeshStandardMaterial({
              map: knifeColor,
              metalnessMap: knifeMetal,
              normalMap: knifeNormal,
              roughnessMap: knifeRough,
              roughness: 0.28,
              metalness: 0.88,
            });
          } else {
            child.material = new THREE.MeshStandardMaterial({
              map: armColor,
              aoMap: armAO,
              normalMap: armNormal,
              roughnessMap: armRough,
              roughness: 0.75,
              metalness: 0.15,
            });
          }
        }
      });

      // Load all 5 animation clips
      const [idleFbx, s1Fbx, s2Fbx, s3Fbx, s4Fbx] = await Promise.all([
        this.loadFBX('/models/Guns/Knife/Animations/Idle/source/arms@knife_idle.fbx').catch(() => null),
        this.loadFBX('/models/Guns/Knife/Animations/Swing 1/source/arms@knife_swing1.fbx').catch(() => null),
        this.loadFBX('/models/Guns/Knife/Animations/Swing 2/source/arms@knife_swing2.fbx').catch(() => null),
        this.loadFBX('/models/Guns/Knife/Animations/Swing 3/source/arms@knife_swing3.fbx').catch(() => null),
        this.loadFBX('/models/Guns/Knife/Animations/Swing 4/source/arms@knife_swing4.fbx').catch(() => null),
      ]);

      const anims = {};
      if (idleFbx && idleFbx.animations && idleFbx.animations.length > 0) anims.idle = idleFbx.animations[0];
      if (s1Fbx && s1Fbx.animations && s1Fbx.animations.length > 0) anims.swing1 = s1Fbx.animations[0];
      if (s2Fbx && s2Fbx.animations && s2Fbx.animations.length > 0) anims.swing2 = s2Fbx.animations[0];
      if (s3Fbx && s3Fbx.animations && s3Fbx.animations.length > 0) anims.swing3 = s3Fbx.animations[0];
      if (s4Fbx && s4Fbx.animations && s4Fbx.animations.length > 0) anims.swing4 = s4Fbx.animations[0];

      model.userData.animations = anims;
      model.scale.setScalar(0.72);
      return model;
    } catch (e) {
      console.warn('Fallback tactical knife viewmodel:', e);
      return this.createTacticalKnife();
    }
  }

  // Find right hand bone across both Counter-Terrorist and Terrorist armatures
  findRightHandBone(model) {
    if (!model) return null;
    let found = null;
    const targetNames = ['Bip01 R Hand', 'hand_r', 'ik_hand_gun', 'R_wrist', 'RightHand', 'mixamorigRightHand'];
    model.traverse((child) => {
      if (child.isBone && targetNames.includes(child.name)) {
        found = child;
      }
    });
    if (!found) {
      model.traverse((child) => {
        if (child.isBone && (/hand.*r|r.*hand|wrist.*r/i.test(child.name))) {
          found = child;
        }
      });
    }
    return found;
  }

  createTacticalKnife() {
    const group = new THREE.Group();

    const bladeGeo = new THREE.BoxGeometry(0.02, 0.05, 0.28);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x99a3a9,
      roughness: 0.2,
      metalness: 0.95,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 0.02, -0.14);
    group.add(blade);

    const tipGeo = new THREE.ConeGeometry(0.028, 0.08, 4);
    const tip = new THREE.Mesh(tipGeo, bladeMat);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0, 0.02, -0.32);
    group.add(tip);

    const guardGeo = new THREE.BoxGeometry(0.04, 0.08, 0.02);
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0x222225,
      roughness: 0.6,
      metalness: 0.4,
    });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.set(0, 0, 0.01);
    group.add(guard);

    const gripGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.16, 8);
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x1a211e,
      roughness: 0.8,
      metalness: 0.1,
    });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(0, 0, 0.09);
    group.add(grip);

    const pommelGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.025, 8);
    const pommel = new THREE.Mesh(pommelGeo, guardMat);
    pommel.rotation.x = Math.PI / 2;
    pommel.position.set(0, 0, 0.18);
    group.add(pommel);

    return group;
  }

  createFallbackCharacter(colorHex, label) {
    const group = new THREE.Group();
    const torsoGeo = new THREE.BoxGeometry(0.46, 0.75, 0.28);
    const torsoMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    torso.name = 'Torso';
    group.add(torso);

    const headGeo = new THREE.SphereGeometry(0.14, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.5 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.68;
    head.castShadow = true;
    head.name = 'Head';
    group.add(head);

    const helmGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 16);
    const helmMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const helm = new THREE.Mesh(helmGeo, helmMat);
    helm.position.y = 1.76;
    group.add(helm);

    const legGeo = new THREE.BoxGeometry(0.18, 0.78, 0.22);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.13, 0.42, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.13, 0.42, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    return group;
  }
}

export const modelManager = new ModelManager();