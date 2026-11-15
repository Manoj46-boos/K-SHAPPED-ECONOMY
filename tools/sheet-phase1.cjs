/**
 * Phase 1 contact sheet — one labeled BEFORE | AFTER sheet per fix, for the
 * panel re-review. Usage:
 *   node tools/sheet-phase1.cjs <name> <before.png> <after.png> [x y w h zoom]
 * Sheets land in download/phase1-evidence/ as SHEET_fix-<name>.png
 */
const path = require('node:path');
const fs = require('node:fs');
const { createCanvas, loadImage } = require(path.resolve(__dirname, '..', 'node_modules', 'canvas'));

const EV = path.resolve(__dirname, '..', '..', 'download', 'phase1-evidence');
const [name, bP, aP, x, y, w, h, zoom = 1] = process.argv.slice(2);
if (!name || !bP || !aP) { console.error('need name before after'); process.exit(1); }

async function loadRegion(p) {
  const img = await loadImage(p);
  if (x === undefined) return { cnv: img, w: img.width, h: img.height };
  const Z = Number(zoom) || 1;
  const cw = Math.round(Number(w) * Z);
  const ch = Math.round(Number(h) * Z);
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, Number(x), Number(y), Number(w), Number(h), 0, 0, cw, ch);
  return { cnv: c, w: cw, h: ch };
}

(async () => {
  const B = await loadRegion(path.join(EV, bP));
  const A = await loadRegion(path.join(EV, aP));
  const H = Math.max(B.h, A.h);
  const scaleB = H / B.h, scaleA = H / A.h;
  const bW = Math.round(B.w * scaleB), aW = Math.round(A.w * scaleA);
  const GAP = 24, LABEL = 56;
  const W = bW + GAP + aW;
  const c = createCanvas(W, H + LABEL);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#152420';
  ctx.fillRect(0, 0, W, H + LABEL);
  ctx.drawImage(B.cnv, 0, LABEL, bW, H);
  ctx.drawImage(A.cnv, bW + GAP, LABEL, aW, H);
  ctx.fillStyle = '#C9A227';
  ctx.fillRect(bW + GAP / 2 - 2, LABEL, 4, H);
  ctx.font = '700 30px Inter';
  ctx.fillStyle = '#F2DAD2';
  ctx.textAlign = 'left';
  ctx.fillText('BEFORE', 16, 38);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#C9E2DA';
  ctx.fillText('AFTER', W - 16, 38);
  ctx.textAlign = 'left';
  ctx.font = '600 22px Inter';
  ctx.fillStyle = '#9FB4AE';
  ctx.fillText(name, bW + 8, 38);
  const out = path.join(EV, `SHEET_fix-${name}.png`);
  fs.writeFileSync(out, c.toBuffer('image/png'));
  console.log(`saved SHEET_fix-${name}.png (${W}x${H + LABEL})`);
})();
