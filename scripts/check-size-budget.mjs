// Fails if the initial load exceeds the spec's budget (section 17).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMITS = {
  initialJsGzip: 500 * 1024,
  initialTransfer: 1.5 * 1024 * 1024,
  tileset: 600 * 1024,
};

const dist = new URL('../dist/', import.meta.url).pathname;
const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) {
  console.error('dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const resolve = (ref) => join(dist, ref.replace(/^\.\//, '').replace(/^\//, ''));

// Initial JS = module script + modulepreload tags in index.html.
const jsRefs = new Set();
for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)) jsRefs.add(m[1]);
for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g))
  jsRefs.add(m[1]);
const cssRefs = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(
  (m) => m[1],
);

if (jsRefs.size === 0) {
  console.error('No initial JS found in dist/index.html.');
  process.exit(1);
}

let jsGzip = 0;
for (const ref of jsRefs) jsGzip += gz(readFileSync(resolve(ref)));
let cssGzip = 0;
for (const ref of cssRefs) cssGzip += gz(readFileSync(resolve(ref)));
const htmlGzip = gz(Buffer.from(html));

// The tileset is fetched during the initial Preload scene, so it counts as initial transfer.
const assetsDir = join(dist, 'assets');
const tilesetFile = readdirSync(assetsDir).find((f) => /^tileset.*\.png$/.test(f));
if (!tilesetFile) {
  console.error('Hashed tileset .png not found in dist/assets.');
  process.exit(1);
}
const tilesetBytes = statSync(join(assetsDir, tilesetFile)).size;

// The debug editor must stay out of the initial bundle (it is lazy-loaded with ?debug=1).
const leaked = [...jsRefs].filter((ref) =>
  readFileSync(resolve(ref), 'utf8').includes('MAP_EDITOR_MARKER'),
);

// ...and it must really exist as its own chunk, otherwise the check above proves nothing.
const lazyChunk = readdirSync(join(dist, 'assets')).find(
  (f) =>
    f.endsWith('.js') &&
    !jsRefs.has(`./assets/${f}`) &&
    !jsRefs.has(`/assets/${f}`) &&
    readFileSync(join(dist, 'assets', f), 'utf8').includes('MAP_EDITOR_MARKER'),
);

const transfer = htmlGzip + jsGzip + cssGzip + tilesetBytes;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`Initial JS (gzip):  ${kb(jsGzip)}  (limit ${kb(LIMITS.initialJsGzip)})`);
console.log(`Initial transfer:   ${kb(transfer)}  (limit ${kb(LIMITS.initialTransfer)})`);
console.log(`Tileset (${tilesetFile}):  ${kb(tilesetBytes)}  (limit ${kb(LIMITS.tileset)})`);

const failures = [];
if (jsGzip > LIMITS.initialJsGzip) failures.push('initial JS over budget');
if (transfer > LIMITS.initialTransfer) failures.push('initial transfer over budget');
if (tilesetBytes > LIMITS.tileset) failures.push('tileset over budget');
if (!lazyChunk) failures.push('debug editor chunk not found (marker missing from lazy chunk)');
if (leaked.length > 0)
  failures.push(`debug editor leaked into the initial bundle (${leaked.join(', ')})`);
if (failures.length > 0) {
  console.error(`FAIL: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`Debug editor is lazy-loaded (${lazyChunk}).`);
console.log('Size budget OK.');
