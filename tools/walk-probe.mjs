/* Phase 2 walk probe — the feed-scale squash-and-stretch unit test.
 * Draws the walking figure at feed scale 0.85 across the strike/push
 * phases with the real walkStrike/walkPush pulses. Run:
 *   node tools/walk-probe.mjs --out x.png */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas } from 'canvas';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(__dirname, '..', '.render-check-build');
const { drawStickmanV2 } = require(path.join(BUILD, 'stickman-v2.js'));
const { Stickman } = require(path.join(BUILD, 'stickman.js'));
const { walkStrike, walkPush } = require(path.join(BUILD, 'scenes-host.js'));

const outIdx = process.argv.indexOf('--out');
const out = outIdx > -1 ? process.argv[outIdx + 1] : '/tmp/walk-probe.png';
const W = 1500, H = 560;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#DCE9E3';
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#0F2733';
ctx.font = '700 26px Inter, sans-serif';
ctx.fillText('FEED-SCALE WALK — strike φ=0.5 / push φ=0.72 (rig 0.85, the 320px register)', 30, 44);

const PHASES = [0.5, 0.72];
PHASES.forEach((ph, i) => {
  const x = 40 + i * 730, y = 90, cw = 690, ch = 430;
  ctx.fillStyle = '#F4F1E8';
  ctx.beginPath();
  ctx.roundRect(x, y, cw, ch, 16);
  ctx.fill();
  ctx.strokeStyle = '#2E4A43';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#0F2733';
  ctx.font = '700 22px Inter, sans-serif';
  ctx.fillText(`φ=${ph} (${i === 0 ? 'walkStrike plant' : 'walkPush launch'})`, x + 18, y + 34);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, cw, ch);
  ctx.clip();
  drawStickmanV2(ctx, x + cw / 2, y + 380, 0.85, 1600, {
    pose: Stickman.walkPose(ph),
    alpha: 1,
    look: 0,
    talk: 0,
    scarf: true,
    satchel: true,
    walkPhase: ph,
    squash: walkStrike(ph),
    stretch: walkPush(ph),
  }, 300 + i * 13);
  ctx.restore();
});

fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('saved', out);

// ── U7 strip mode (Visual Quality Audit §4.3 — THE STRIP TEST) ──
// `--strip out.png` dumps the 4-frame walk strip at 300ms spacing from
// the keyed cycle: alternating arm leads must read in silhouette between
// f1 and f3. Permanent harness artifact; part of `npm run gates`.
const stripIdx = process.argv.indexOf('--strip');
if (stripIdx > -1) {
  const stripOut = process.argv[stripIdx + 1] || '/tmp/walk-strip.png';
  // 300ms spacing on the film's walk clock: the cycle samples every
  // 0.30s of stride time at the walker's cadence (phase step ≈ 0.30).
  const PHASES4 = [0.05, 0.35, 0.65, 0.95];
  const sw = 720, sh = 640, cols = 4;
  const sheet = createCanvas(sw * cols + 60, sh + 90);
  const sx = sheet.getContext('2d');
  sx.fillStyle = '#14181C';
  sx.fillRect(0, 0, sheet.width, sheet.height);
  sx.fillStyle = '#E8B84A';
  sx.font = '700 22px Inter, sans-serif';
  sx.fillText('U7 WALK STRIP — 300ms spacing: alternating arm leads must read f1 vs f3', 16, 30);
  PHASES4.forEach((ph, i) => {
    const x0 = 16 + i * (sw + 8), y0 = 46;
    sx.fillStyle = '#F4F1E8';
    sx.beginPath();
    sx.roundRect(x0, y0, sw, sh, 12);
    sx.fill();
    sx.save();
    sx.beginPath();
    sx.rect(x0, y0, sw, sh);
    sx.clip();
    drawStickmanV2(sx, x0 + sw / 2, y0 + 560, 1.25, 1600 + i * 300, {
      pose: Stickman.walkPose(ph),
      alpha: 1,
      look: 0,
      talk: 0,
      scarf: true,
      satchel: true,
      walkPhase: ph,
      squash: walkStrike(ph),
      stretch: walkPush(ph),
    }, 300 + i * 13);
    sx.restore();
    sx.fillStyle = '#fff';
    sx.font = '700 20px Inter, sans-serif';
    sx.fillText(`f${i + 1}  φ=${ph.toFixed(2)}  (t+${i * 300}ms)`, x0 + 16, y0 + sh + 28);
  });
  fs.writeFileSync(stripOut, sheet.toBuffer('image/png'));
  console.log('saved strip', stripOut);
}
