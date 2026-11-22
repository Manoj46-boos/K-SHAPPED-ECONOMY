/**
 * k20-test.mjs — U13 (market review Table 5, the Alan Becker test): the
 * brand K must be nameable from the outline alone at 20px. Draws drawK3D
 * (the one construction) at 20 / 24 / 46 px, saves at 8x zoom for the
 * panel sheet, and prints the outline-ink share per size.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas, registerFont } from 'canvas';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(REPO, '.render-check-build');
for (const [f, family, weight] of [
  ['Inter-400.ttf', 'Inter', 400], ['Inter-600.ttf', 'Inter', 600], ['Inter-700.ttf', 'Inter', 700],
  ['Fraunces-400.ttf', 'Fraunces', 400], ['Fraunces-600.ttf', 'Fraunces', 600], ['Fraunces-700.ttf', 'Fraunces', 700],
]) registerFont(path.join(REPO, 'public', 'fonts', f), { family, weight: String(weight) });
globalThis.document = { createElement: () => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };

const { drawK3D } = require(path.join(BUILD, 'effects.js'));
const { PALETTE } = require(path.join(BUILD, 'theme.js'));

const outDir = path.join(REPO, 'work', 'ba4');
fs.mkdirSync(outDir, { recursive: true });
const sizes = [20, 24, 46];
const zoom = 8;
const tiles = [];
for (const s of sizes) {
  // the K3D anchor is the letter's CENTER — give the full letter air so the
  // Alan Becker test judges the whole outline, not a fragment
  const half = Math.ceil(s * 1.35);
  const c = createCanvas(half * 2, half * 2);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#EFE9DB'; // the ivory stage
  ctx.fillRect(0, 0, c.width, c.height);
  drawK3D(ctx, half, half, s, 1, 4000, false);
  tiles.push({ s, c });
  const big = createCanvas(c.width * zoom, c.height * zoom);
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(c, 0, 0, big.width, big.height);
  fs.writeFileSync(path.join(outDir, `AFTER_U13_K20-${s}px.png`), big.toBuffer('image/png'));
  // outline-ink share: the K's dark ink vs the ivory ground
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let ink = 0, tot = 0;
  for (let i = 0; i < d.length; i += 4) { tot++; if (d[i] < 110) ink++; }
  console.log(`K @ ${s}px: ink share ${(ink / tot * 100).toFixed(1)}%`);
}
// one comparison strip
const strip = createCanvas((tiles[0].c.width + 8) * tiles.length * zoom, tiles[0].c.height * zoom + 30);
const sctx = strip.getContext('2d');
sctx.fillStyle = '#181818'; sctx.fillRect(0, 0, strip.width, strip.height);
let x = 8;
for (const { s, c } of tiles) {
  sctx.fillStyle = '#EFE9DB'; sctx.fillRect(x, 26, c.width * zoom, c.height * zoom);
  sctx.drawImage(c, x, 26, c.width * zoom, c.height * zoom);
  sctx.fillStyle = '#FFD278'; sctx.font = '13px Inter'; sctx.fillText(`${s}px`, x + 6, 18);
  x += (c.width + 8) * zoom;
}
fs.writeFileSync(path.join(outDir, 'AFTER_U13_K20-strip.png'), strip.toBuffer('image/png'));
console.log('strip saved');