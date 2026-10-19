const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== TACOPS STANDALONE HTML COMPILER ===');

const projectRoot = 'H:\\Tacops-Full';
process.chdir(projectRoot);

const outDir = 'H:\\TacopsBackup';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
const outFile = path.join(outDir, 'index.html');

console.log('1. Building production bundle with Vite...');
execSync('npm.cmd run build', { cwd: projectRoot, stdio: 'inherit' });

console.log('2. Reading dist files...');
const distHtml = fs.readFileSync(path.join(projectRoot, 'dist/index.html'), 'utf8');

// Find CSS file
const cssMatch = distHtml.match(/<link[^>]+href=["'](\/assets\/[^"']+\.css)["'][^>]*>/i);
if (!cssMatch) {
  throw new Error('Could not find CSS link in dist/index.html');
}
const cssRelPath = cssMatch[1].replace(/^\//, '');
const cssContent = fs.readFileSync(path.join(projectRoot, 'dist', cssRelPath), 'utf8');
console.log('   Inlined CSS:', cssRelPath, '(' + (cssContent.length / 1024).toFixed(1) + ' KB)');

// Find JS bundle
const jsMatch = distHtml.match(/<script[^>]+src=["'](\/assets\/[^"']+\.js)["'][^>]*><\/script>/i);
if (!jsMatch) {
  throw new Error('Could not find JS script in dist/index.html');
}
const jsRelPath = jsMatch[1].replace(/^\//, '');
let jsContent = fs.readFileSync(path.join(projectRoot, 'dist', jsRelPath), 'utf8');
// Sanitize </script> in JS
jsContent = jsContent.replace(/<\/script>/gi, '<\\/script>');
console.log('   Inlined JS:', jsRelPath, '(' + (jsContent.length / 1024).toFixed(1) + ' KB)');

// MIME type helper
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.json': return 'application/json';
    case '.fbx': return 'application/octet-stream';
    case '.glb': return 'model/gltf-binary';
    case '.gltf': return 'model/gltf+json';
    case '.wav': return 'audio/wav';
    case '.mp3': return 'audio/mpeg';
    case '.ogg': return 'audio/ogg';
    default: return 'application/octet-stream';
  }
}

// Find all assets to embed
function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

const distPath = path.join(projectRoot, 'dist');
const allDistFiles = walkDir(distPath);
const assetFiles = allDistFiles.filter(f => {
  const rel = path.relative(distPath, f).replace(/\\/g, '/');
  if (rel === 'index.html') return false;
  if (rel === cssRelPath) return false;
  if (rel === jsRelPath) return false;
  return true;
});

console.log('3. Embedding ' + assetFiles.length + ' assets (models, textures, maps)...');

// Open stream to target file
const writeStream = fs.createWriteStream(outFile, { encoding: 'utf8' });

// Prepare HTML structure:
// Replace CSS link with inline style
let processedHtml = distHtml.replace(cssMatch[0], '<style>\n' + cssContent + '\n</style>');

// Remove external JS script tag (we will inject it at the end of body)
processedHtml = processedHtml.replace(jsMatch[0], '');

// Split at </head> to inject bootloader and inert asset scripts
const headCloseIndex = processedHtml.indexOf('</head>');
if (headCloseIndex === -1) throw new Error('No </head> tag found in HTML');

const headBefore = processedHtml.substring(0, headCloseIndex);
const bodyAfter = processedHtml.substring(headCloseIndex);

writeStream.write(headBefore);

// Write bootloader script
const bootloader = `
  <!-- TACOPS STANDALONE ASSET BOOTLOADER -->
  <script>
  (function() {
    window.__ASSET_BLOB_URLS__ = {};

    function base64ToBlob(base64, mime) {
      const sliceSize = 1024 * 512;
      const byteCharacters = atob(base64);
      const byteArrays = [];
      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Uint8Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(byteNumbers);
      }
      return new Blob(byteArrays, { type: mime });
    }

    // Process all inert asset script tags
    const assetScripts = document.querySelectorAll('script[data-asset]');
    assetScripts.forEach(el => {
      try {
        const rawPath = el.getAttribute('data-asset');
        const mime = el.getAttribute('data-mime') || 'application/octet-stream';
        const b64 = el.textContent.trim();
        const blob = base64ToBlob(b64, mime);
        const blobUrl = URL.createObjectURL(blob);

        const clean = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
        window.__ASSET_BLOB_URLS__[clean] = blobUrl;
        window.__ASSET_BLOB_URLS__[clean.toLowerCase()] = blobUrl;
        window.__ASSET_BLOB_URLS__[clean.substring(1)] = blobUrl;
        window.__ASSET_BLOB_URLS__[clean.substring(1).toLowerCase()] = blobUrl;

        const parts = clean.split('/');
        const basename = parts[parts.length - 1];
        window.__ASSET_BLOB_URLS__[basename] = blobUrl;
        window.__ASSET_BLOB_URLS__[basename.toLowerCase()] = blobUrl;

        // Free memory immediately
        el.textContent = '';
        el.remove();
      } catch (err) {
        console.warn('Error creating blob for', el.getAttribute('data-asset'), err);
      }
    });

    function resolveUrl(url) {
      if (!url || typeof url !== 'string') return url;
      if (url.startsWith('blob:') || url.startsWith('data:')) return url;
      if (window.__ASSET_BLOB_URLS__[url]) return window.__ASSET_BLOB_URLS__[url];
      if (window.__ASSET_BLOB_URLS__[url.toLowerCase()]) return window.__ASSET_BLOB_URLS__[url.toLowerCase()];

      try {
        const dec = decodeURIComponent(url);
        if (window.__ASSET_BLOB_URLS__[dec]) return window.__ASSET_BLOB_URLS__[dec];
      } catch(e) {}

      try {
        const parsed = new URL(url, window.location.href);
        const pathname = parsed.pathname;
        if (window.__ASSET_BLOB_URLS__[pathname]) return window.__ASSET_BLOB_URLS__[pathname];
        if (window.__ASSET_BLOB_URLS__[pathname.toLowerCase()]) return window.__ASSET_BLOB_URLS__[pathname.toLowerCase()];

        const parts = pathname.split('/');
        const basename = parts[parts.length - 1];
        if (window.__ASSET_BLOB_URLS__[basename]) return window.__ASSET_BLOB_URLS__[basename];
        if (window.__ASSET_BLOB_URLS__[basename.toLowerCase()]) return window.__ASSET_BLOB_URLS__[basename.toLowerCase()];
      } catch(e) {}

      return url;
    }
    window.__resolveTacopsAssetUrl = resolveUrl;

    // 1. Hook THREE.DefaultLoadingManager
    let _three = window.THREE;
    function hookThree(threeObj) {
      if (threeObj && threeObj.DefaultLoadingManager) {
        threeObj.DefaultLoadingManager.setURLModifier(function(url) {
          return resolveUrl(url);
        });
      }
    }
    if (_three) hookThree(_three);
    else {
      Object.defineProperty(window, 'THREE', {
        configurable: true,
        enumerable: true,
        get: () => _three,
        set: (v) => { _three = v; hookThree(v); }
      });
    }

    // 2. Hook window.fetch
    const origFetch = window.fetch;
    window.fetch = function(resource, init) {
      let url = typeof resource === 'string' ? resource : (resource && resource.url);
      const resolved = resolveUrl(url);
      if (resolved && resolved !== url) {
        if (typeof resource === 'string') resource = resolved;
        else if (resource instanceof Request) resource = new Request(resolved, resource);
      }
      return origFetch.call(this, resource, init);
    };

    // 3. Hook XMLHttpRequest
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      const resolved = resolveUrl(url);
      return origOpen.call(this, method, resolved || url, ...rest);
    };

    // 4. Hook Image src
    const origImgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (origImgDesc && origImgDesc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        get: origImgDesc.get,
        set: function(val) {
          const resolved = resolveUrl(val);
          return origImgDesc.set.call(this, resolved || val);
        },
        configurable: true,
        enumerable: true
      });
    }

    // 5. Replace existing DOM images with blob URLs once DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('img[src]').forEach(img => {
        const s = img.getAttribute('src');
        const r = resolveUrl(s);
        if (r && r !== s) img.src = r;
      });
    });

    console.log('[TacOps] Standalone Asset Bootloader initialized with', Object.keys(window.__ASSET_BLOB_URLS__).length, 'routes.');
  })();
  </script>
`;

writeStream.write(bootloader);

// Write inert asset script tags
let count = 0;
for (const file of assetFiles) {
  const rel = '/' + path.relative(distPath, file).replace(/\\/g, '/');
  const mime = getMimeType(file);
  const buf = fs.readFileSync(file);
  const b64 = buf.toString('base64');
  writeStream.write('<script type="text/plain" data-asset="' + rel + '" data-mime="' + mime + '">' + b64 + '</script>\n');
  count++;
  if (count % 20 === 0 || count === assetFiles.length) {
    console.log('   Inlined ' + count + '/' + assetFiles.length + ' assets...');
  }
}

// Split bodyAfter before </body> to inject JS module
const bodyCloseIndex = bodyAfter.indexOf('</body>');
if (bodyCloseIndex === -1) throw new Error('No </body> tag found in HTML');

const bodyBeforeClose = bodyAfter.substring(0, bodyCloseIndex);
const htmlEnd = bodyAfter.substring(bodyCloseIndex);

writeStream.write(bodyBeforeClose);

// Write JS bundle
writeStream.write('\n<script type="module">\n' + jsContent + '\n</script>\n');
writeStream.write(htmlEnd);

writeStream.end(() => {
  const stat = fs.statSync(outFile);
  console.log('========================================================');
  console.log('SUCCESS! Standalone HTML compilation complete:');
  console.log('Output file:', outFile);
  console.log('Total file size:', (stat.size / (1024 * 1024)).toFixed(2), 'MB');
  console.log('========================================================');
});
