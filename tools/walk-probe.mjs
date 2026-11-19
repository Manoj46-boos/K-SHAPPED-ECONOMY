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

const out = process.argv[process.argv.indexOf('--out') + 1] || '/tmp/walk-probe.png';
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
