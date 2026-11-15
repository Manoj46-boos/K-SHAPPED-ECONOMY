/**
 * Crop/zoom helper — Phase 0 evidence. Extracts a region of a PNG at an
 * optional zoom so sub-20px defects (shadow offsets, label clipping) are
 * visible to the panel at a glance.
 *   node tools/crop-phase0.cjs <in.png> <out.png> <x> <y> <w> <h> [zoom]
 */
const path = require('node:path');
const fs = require('node:fs');
const { createCanvas, loadImage } = require(path.resolve(__dirname, '..', 'node_modules', 'canvas'));

const [inP, outP, x, y, w, h, zoom = 1] = process.argv.slice(2);
loadImage(inP).then((img) => {
  const Z = Number(zoom) || 1;
  const cw = Math.round(Number(w) * Z);
  const ch = Math.round(Number(h) * Z);
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, Number(x), Number(y), Number(w), Number(h), 0, 0, cw, ch);
  fs.writeFileSync(outP, c.toBuffer('image/png'));
  console.log(`saved ${outP} (${cw}x${ch})`);
});
