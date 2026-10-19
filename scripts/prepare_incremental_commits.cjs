const { execSync } = require('child_process');
const fs = require('fs');

function run(cmd) {
  console.log('> ' + cmd);
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, GIT_AUTHOR_NAME: 'Seth', GIT_AUTHOR_EMAIL: 'sethjayasundera@gmail.com', GIT_COMMITTER_NAME: 'Seth', GIT_COMMITTER_EMAIL: 'sethjayasundera@gmail.com' } });
}

function safeAdd(pattern) {
  try {
    run('git add ' + pattern);
  } catch (e) {
    console.warn('Could not add ' + pattern + ':', e.message);
  }
}

// Reset publish-clean
run('git reset');

// Commit 1: Core Engine, UI, Scripts, Config, Sounds, and README
console.log('--- Staging Commit 1: Core Engine & UI ---');
safeAdd('package.json index.html src/ README.md .gitignore public/favicon.svg public/audio/ scripts/convert_dust2_assets.js');
if (fs.existsSync('package-lock.json')) safeAdd('package-lock.json');
run('git commit -m "Initialize TacOps: Core Three.js FPS engine, physics, UI, audio, and roadmap"');

// Commit 2: Map assets (Dust II Largo)
console.log('--- Staging Commit 2: Dust II Largo Map ---');
safeAdd('public/models/Maps/');
run('git commit -m "Integrate authentic Dust II Largo: BSP collision, floor geometry, and Mediterranean textures"');

// Commit 3: M16A3 Rifle
console.log('--- Staging Commit 3: M16A3 Rifle ---');
safeAdd('public/models/Guns/Rifle/');
run('git commit -m "Add M16A3 tactical assault rifle model and PBR textures"');

// Commit 4: Desert Eagle Sidearm
console.log('--- Staging Commit 4: Desert Eagle ---');
safeAdd('public/models/Guns/GoldenEagle/');
run('git commit -m "Add Desert Eagle heavy caliber sidearm model and textures"');

// Commit 5: P90 Tactical SMG
console.log('--- Staging Commit 5: P90 SMG ---');
safeAdd('public/models/Guns/P90/');
run('git commit -m "Add P90 Tactical bullpup SMG model and optimized PNG textures"');

// Commit 6: Terrorist Character & Mixamo Animations
console.log('--- Staging Commit 6: Terrorist Character ---');
safeAdd('public/models/Terrorist/');
run('git commit -m "Add authentic Counter Strike Terrorist model and animations with 3rd-person facing fix"');

// Commit 7: Counter-Terrorist Character & Rigged Animations
console.log('--- Staging Commit 7: Counter-Terrorist Character ---');
safeAdd('public/models/Animations/CounterTerrorist/ public/models/CounterTerrorist/');
run('git commit -m "Add tactical Counter-Terrorist SAS model and Blender-fit movement animations"');

// Commit 8: Animated Knife (4 swings + idle walk) and TacOps Logo
console.log('--- Staging Commit 8: Knife & Logo ---');
safeAdd('public/models/Guns/Knife/ public/assets/ src/assets/');
run('git commit -m "Add animated tactical knife with 4-swing combo, walk idle, and TacOps emblem logo"');

console.log('All incremental commits successfully created on publish-clean!');
