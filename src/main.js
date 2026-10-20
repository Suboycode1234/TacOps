import * as THREE from 'three';
window.THREE = THREE;
if (typeof window !== 'undefined' && window.__resolveTacopsAssetUrl) {
  THREE.DefaultLoadingManager.setURLModifier((url) => window.__resolveTacopsAssetUrl(url));
}
import { Game } from './core/Game.js';
import { WEAPONS, EQUIPMENT } from './core/WeaponData.js';
import { soundManager } from './core/SoundManager.js';
import confetti from 'canvas-confetti';

// DOM Elements
const canvasContainer = document.getElementById('canvas-container');
const crosshair = document.getElementById('crosshair');
const hitmarker = document.getElementById('hitmarker');
const hpVal = document.getElementById('hp-val');
const armorVal = document.getElementById('armor-val');
const moneyVal = document.getElementById('money-value');
const buyMenuMoney = document.getElementById('buy-menu-money');
const buyZoneIndicator = document.getElementById('buy-zone-indicator');
const weaponTitle = document.getElementById('weapon-title');
const ammoMag = document.getElementById('ammo-mag');
const ammoReserve = document.getElementById('ammo-reserve');
const reloadPill = document.getElementById('reload-pill');
const roundTime = document.getElementById('round-time');
const roundCount = document.getElementById('round-count');
const ctScore = document.getElementById('ct-score');
const tScore = document.getElementById('t-score');
const ctAvatars = document.getElementById('ct-avatars');
const tAvatars = document.getElementById('t-avatars');
const killfeed = document.getElementById('killfeed');
const buyMenuOverlay = document.getElementById('buy-menu-overlay');
const closeBuyBtn = document.getElementById('close-buy-btn');
const roundBanner = document.getElementById('round-banner');
const bannerTitle = document.getElementById('banner-title');
const bannerSub = document.getElementById('banner-sub');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const openTeamBtn = document.getElementById('open-team-btn');
// Map Selection Elements
const mapCardCs16 = document.getElementById('map-card-cs16');
const mapCardCs2 = document.getElementById('map-card-cs2') || document.getElementById('map-card-csgo');
const mapPill = document.getElementById('map-pill');
const openMapBtn = document.getElementById('open-map-btn');
let currentMap = 'cs16';


// Team Select Elements
const teamSelectOverlay = document.getElementById('team-select-overlay');
const selectCtBtn = document.getElementById('select-ct-btn');
const selectTBtn = document.getElementById('select-t-btn');

// Start Game
const game = new Game(canvasContainer);
let isBuyMenuOpen = false;
let isTeamSelectOpen = true; // Open on initial load

// Format seconds to mm:ss
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Update Top Match Header
game.onUIUpdate = (data) => {
  roundTime.textContent = formatTime(data.timer);
  roundCount.textContent = `ROUND ${data.currentRound}`;
  ctScore.textContent = data.ctScore;
  tScore.textContent = data.tScore;

  if (data.playerTeam === 'CT') {
    // Player is CT
    ctAvatars.innerHTML = `<div class="avatar-icon alive ct"></div>`;
    tAvatars.innerHTML = '';
    for (let i = 0; i < data.totalBots; i++) {
      const dot = document.createElement('div');
      dot.className = `avatar-icon ${i < data.aliveBots ? 'alive t' : 'dead'}`;
      tAvatars.appendChild(dot);
    }
  } else {
    // Player is T
    tAvatars.innerHTML = `<div class="avatar-icon alive t"></div>`;
    ctAvatars.innerHTML = '';
    for (let i = 0; i < data.totalBots; i++) {
      const dot = document.createElement('div');
      dot.className = `avatar-icon ${i < data.aliveBots ? 'alive ct' : 'dead'}`;
      ctAvatars.appendChild(dot);
    }
  }
};

// Player Stats Change Hook
game.player.onStatsChange = (stats) => {
  hpVal.textContent = stats.health;
  if (stats.health <= 25) hpVal.classList.add('low');
  else hpVal.classList.remove('low');

  armorVal.textContent = stats.armor;
  moneyVal.textContent = stats.money;
  buyMenuMoney.textContent = stats.money;

  weaponTitle.textContent = stats.weaponName.toUpperCase();
  ammoMag.textContent = stats.ammo === Infinity ? '∞' : stats.ammo;
  ammoReserve.textContent = stats.reserve === Infinity ? '∞' : stats.reserve;

  if (stats.isReloading) reloadPill.classList.add('active');
  else reloadPill.classList.remove('active');

  if (stats.inBuyZone) buyZoneIndicator.classList.add('active');
  else buyZoneIndicator.classList.remove('active');

  const viewModePill = document.getElementById('view-mode-pill');
  if (viewModePill) {
    viewModePill.textContent = stats.isThirdPerson ? 'VIEW: 3RD PERSON [V]' : 'VIEW: 1ST PERSON [V]';
    viewModePill.style.color = stats.isThirdPerson ? '#4da6ff' : '#8b949e';
  }

  // Dynamic crosshair spread calculation
  let spreadScale = 1.0;
  const speed = game.player.velocity.length();
  spreadScale += Math.min(speed * 0.15, 1.2);
  spreadScale += game.player.recoilOffset.length() * 4.0;
  if (game.player.isCrouching) spreadScale *= 0.7;
  if (game.player.isADS) spreadScale *= 0.5;

  crosshair.style.transform = `translate(-50%, -50%) scale(${spreadScale.toFixed(2)})`;

  // Update buy cards disabled state
  updateBuyCardsState(stats.money);
};

// Hitmarker flash
game.player.onHit = (isHeadshot) => {
  hitmarker.classList.add('active');
  setTimeout(() => {
    hitmarker.classList.remove('active');
  }, 100);
};

// Kill Feed Event
game.onKillFeed = (event) => {
  hitmarker.classList.add('active');
  setTimeout(() => hitmarker.classList.remove('active'), 120);

  const row = document.createElement('div');
  row.className = 'kill-row';

  const headshotHtml = event.isHeadshot
    ? '<span class="headshot-badge"> 🎯 HEADSHOT</span>'
    : '';

  row.innerHTML = `
    <span class="kill-killer">${event.killer}</span>
    <span class="kill-weapon">${event.weapon}</span>
    <span class="kill-victim">${event.victim}</span>
    ${headshotHtml}
  `;

  killfeed.appendChild(row);
  setTimeout(() => {
    row.style.opacity = '0';
    row.style.transform = 'translateX(20px)';
    setTimeout(() => row.remove(), 300);
  }, 4200);
};

// Round End Banner
game.onRoundEnd = (winner) => {
  if (!winner) {
    roundBanner.classList.remove('show');
    return;
  }

  roundBanner.className = `show ${winner.toLowerCase()}`;
  bannerTitle.className = winner.toLowerCase();

  const isPlayerTeam = winner === game.playerTeam;

  if (winner === 'CT') {
    bannerTitle.textContent = 'COUNTER-TERRORISTS WIN';
    bannerSub.textContent = isPlayerTeam ? '+$3,250 Victory Bonus' : 'Round Lost';
  } else {
    bannerTitle.textContent = 'TERRORISTS WIN';
    bannerSub.textContent = isPlayerTeam ? '+$3,250 Victory Bonus' : 'Round Lost';
  }

  if (isPlayerTeam) {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.4 },
      colors: winner === 'CT' ? ['#4da6ff', '#38ef7d', '#ffffff'] : ['#e09f3e', '#ff3344', '#ffffff'],
    });
  }

  setTimeout(() => {
    roundBanner.classList.remove('show');
  }, 4500);
};

// Team Selection Logic
function selectFaction(team) {
  isTeamSelectOpen = false;
  teamSelectOverlay.classList.remove('open');
  pauseOverlay.classList.add('hidden');
  game.setPlayerTeam(team);
  soundManager.playBuySound();
  canvasContainer.click(); // Re-lock pointer
}

function openTeamSelect() {
  isTeamSelectOpen = true;
  teamSelectOverlay.classList.add('open');
  if (document.exitPointerLock) {
    document.exitPointerLock();
  }
}

selectCtBtn.addEventListener('click', () => selectFaction('CT'));
selectTBtn.addEventListener('click', () => selectFaction('T'));

// Map Selector Logic
function updateMapUI(mapId) {
  currentMap = mapId;
  if (mapCardCs16) {
    if (mapId === 'cs16') mapCardCs16.classList.add('active');
    else mapCardCs16.classList.remove('active');
  }
  if (mapCardCs2) {
    if (mapId === 'cs2' || mapId === 'csgo') mapCardCs2.classList.add('active');
    else mapCardCs2.classList.remove('active');
  }
  if (mapPill) {
    mapPill.textContent = (mapId === 'cs2' || mapId === 'csgo') ? 'MAP: CS2 [F2]' : 'MAP: CS 1.6 [F2]';
    mapPill.style.color = (mapId === 'cs2' || mapId === 'csgo') ? '#48cae4' : '#ffb703';
    mapPill.style.borderColor = (mapId === 'cs2' || mapId === 'csgo') ? 'rgba(72, 202, 228, 0.4)' : 'rgba(255, 170, 0, 0.35)';
    mapPill.style.background = (mapId === 'cs2' || mapId === 'csgo') ? 'rgba(0, 180, 216, 0.12)' : 'rgba(255, 170, 0, 0.12)';
  }
  if (openMapBtn) {
    openMapBtn.textContent = (mapId === 'cs2' || mapId === 'csgo') ? 'SWITCH MAP: CS 1.6 (F2)' : 'SWITCH MAP: CS2 (F2)';
    openMapBtn.style.color = (mapId === 'cs2' || mapId === 'csgo') ? '#ffb703' : '#48cae4';
    openMapBtn.style.borderColor = (mapId === 'cs2' || mapId === 'csgo') ? 'rgba(255, 183, 3, 0.5)' : 'rgba(72, 202, 228, 0.5)';
  }
}

async function selectMap(mapId) {
  if (currentMap === mapId && game.mapManager.mapLoaded) return;
  updateMapUI(mapId);
  soundManager.playBuySound();
  await game.switchMap(mapId);
}

if (mapCardCs16) mapCardCs16.addEventListener('click', () => selectMap('cs16'));
if (mapCardCs2) mapCardCs2.addEventListener('click', () => selectMap('cs2'));
if (mapPill) mapPill.addEventListener('click', () => selectMap(currentMap === 'cs16' ? 'cs2' : 'cs16'));
if (openMapBtn) openMapBtn.addEventListener('click', () => selectMap(currentMap === 'cs16' ? 'cs2' : 'cs16'));

game.onMapChanged = (mapId) => updateMapUI(mapId);


openTeamBtn.addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  openTeamSelect();
});

// Buy Menu Logic
function openBuyMenu() {
  if (isTeamSelectOpen) return;
  isBuyMenuOpen = true;
  buyMenuOverlay.classList.add('open');
  if (document.exitPointerLock) {
    document.exitPointerLock();
  }
}

function closeBuyMenu() {
  isBuyMenuOpen = false;
  buyMenuOverlay.classList.remove('open');
  canvasContainer.click();
}

function toggleBuyMenu() {
  if (isBuyMenuOpen) closeBuyMenu();
  else openBuyMenu();
}

function updateBuyCardsState(currentMoney) {
  const cards = document.querySelectorAll('.weapon-buy-card');
  cards.forEach((card) => {
    const weaponId = card.getAttribute('data-weapon');
    const equipId = card.getAttribute('data-equipment');
    let price = 0;
    if (weaponId && WEAPONS[weaponId]) price = WEAPONS[weaponId].price;
    if (equipId && EQUIPMENT[equipId]) price = EQUIPMENT[equipId].price;

    if (currentMoney < price) {
      card.classList.add('disabled');
    } else {
      card.classList.remove('disabled');
    }
  });
}

document.querySelectorAll('.weapon-buy-card').forEach((card) => {
  card.addEventListener('click', () => {
    const weaponId = card.getAttribute('data-weapon');
    const equipId = card.getAttribute('data-equipment');

    if (weaponId) {
      const bought = game.player.buyWeapon(weaponId);
      if (bought) closeBuyMenu();
    } else if (equipId) {
      const bought = game.player.buyEquipment(equipId);
      if (bought) closeBuyMenu();
    }
  });
});

closeBuyBtn.addEventListener('click', closeBuyMenu);

// Keyboard controls
window.addEventListener('keydown', (e) => {

  // Map hotkeys: F1 for CS 1.6, F2 for CS:GO (or toggle)
  if (e.code === 'F1') {
    e.preventDefault();
    selectMap('cs16');
    return;
  }
  if (e.code === 'F2') {
    e.preventDefault();
    selectMap(currentMap === 'cs16' ? 'cs2' : 'cs16');
    return;
  }

  // Team Selection hotkeys
  if (isTeamSelectOpen) {
    if (e.code === 'Digit1') {
      selectFaction('CT');
      return;
    } else if (e.code === 'Digit2') {
      selectFaction('T');
      return;
    }
    return;
  }

  // Open Team Select with 'M'
  if (e.code === 'KeyM') {
    e.preventDefault();
    openTeamSelect();
    return;
  }

  // Buy Menu toggle with 'B'
  if (e.code === 'KeyB') {
    e.preventDefault();
    toggleBuyMenu();
    return;
  }

  if (isBuyMenuOpen) {
    if (e.code === 'Escape') {
      closeBuyMenu();
      return;
    }
    if (e.code === 'Digit1') {
      if (game.player.buyWeapon('deagle')) closeBuyMenu();
    } else if (e.code === 'Digit2') {
      if (game.player.buyWeapon('p90')) closeBuyMenu();
    } else if (e.code === 'Digit3') {
      if (game.player.buyWeapon('m16')) closeBuyMenu();
    } else if (e.code === 'Digit4') {
      if (game.player.buyEquipment('helmet')) closeBuyMenu();
    }
  }
});

// Pointer Lock Pause Overlay
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === game.renderer.domElement) {
    pauseOverlay.classList.add('hidden');
    teamSelectOverlay.classList.remove('open');
    buyMenuOverlay.classList.remove('open');
  } else {
    if (!isBuyMenuOpen && !isTeamSelectOpen) {
      pauseOverlay.classList.remove('hidden');
    }
  }
});

resumeBtn.addEventListener('click', () => {
  pauseOverlay.classList.add('hidden');
  game.renderer.domElement.requestPointerLock();
});

const viewModePillBtn = document.getElementById('view-mode-pill');
if (viewModePillBtn) {
  viewModePillBtn.addEventListener('click', () => {
    game.player.toggleCameraMode();
  });
}


// Wire Interactive GUI Weapon Selector Bar
const slotBtn1 = document.getElementById('slot-btn-1');
const slotBtn2 = document.getElementById('slot-btn-2');
const slotBtn3 = document.getElementById('slot-btn-3');
const slot1Name = document.getElementById('slot-1-name');
const slot2Name = document.getElementById('slot-2-name');
const openArmoryBtn = document.getElementById('open-armory-btn');

function updateWeaponGuiSlots() {
  if (!game || !game.player) return;
  const p = game.player;
  const active = p.activeSlot;
  if (slotBtn1) slotBtn1.classList.toggle('active', active === 1);
  if (slotBtn2) slotBtn2.classList.toggle('active', active === 2);
  if (slotBtn3) slotBtn3.classList.toggle('active', active === 3);

  if (slot1Name) {
    slot1Name.textContent = p.inventory[1] ? p.inventory[1].name.toUpperCase() : 'NO PRIMARY';
  }
  if (slot2Name) {
    slot2Name.textContent = p.inventory[2] ? p.inventory[2].name.toUpperCase() : 'DEAGLE';
  }
}

if (slotBtn1) slotBtn1.addEventListener('click', (e) => { e.stopPropagation(); if (game && game.player && game.player.inventory[1]) { game.player.switchSlot(1); updateWeaponGuiSlots(); } });
if (slotBtn2) slotBtn2.addEventListener('click', (e) => { e.stopPropagation(); if (game && game.player) { game.player.switchSlot(2); updateWeaponGuiSlots(); } });
if (slotBtn3) slotBtn3.addEventListener('click', (e) => { e.stopPropagation(); if (game && game.player) { game.player.switchSlot(3); updateWeaponGuiSlots(); } });
if (openArmoryBtn) openArmoryBtn.addEventListener('click', (e) => { e.stopPropagation(); openBuyMenu(); });

