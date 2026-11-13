// Phase 2 item 3 evidence: a 9-frame SCRUB STRIP across the sit window —
// t = group_start + {1800, 2100, 2400, 2600, 2900, 3300, 3800, 4500, 5000}.
// The BEFORE tree renders the standing host at every t; the AFTER tree
// renders sitRise landing into sitBack from t=2400 on.
// Run: node tools/sit-scrub.mjs [--before]   (OUT_DIR env for destination)
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas, registerFont } from 'canvas';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(REPO, '.render-check-build');
const OUT = process.env.OUT_DIR || path.join(REPO, 'harness-frames');

if (!fs.existsSync(path.join(BUILD, 'director.js'))) {
  console.error('run render-check first (build cache missing)');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

for (const [f, family, weight] of [
  ['Inter-400.ttf', 'Inter', 400], ['Inter-600.ttf', 'Inter', 600],
  ['Inter-700.ttf', 'Inter', 700], ['Fraunces-400.ttf', 'Fraunces', 400],
  ['Fraunces-600.ttf', 'Fraunces', 600], ['Fraunces-700.ttf', 'Fraunces', 700],
]) registerFont(path.join(REPO, 'public', 'fonts', f), { family, weight });

globalThis.document = { createElement: () => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };

// the manifest the main harness synthesizes (word timings) — mirror
// render-check.mjs's loader exactly
const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));
const { drawFrame } = require(path.join(BUILD, 'director.js'));

function estWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  let t = 0;
  for (const w of words) {
    const d = Math.min(650, 180 + w.length * 38);
    out.push({ t: Math.round(t), d: Math.round(d), w });
    t += d + 45;
  }
  return { words: out, durMs: Math.round(t) };
}

const manifest = { lines: {} };
SCRIPT.forEach((chapter, ci) => {
  chapter.beats.forEach((beat, bi) => {
    splitSentences(beat.vo).forEach((text, si) => {
      const { words, durMs } = estWords(text);
      manifest.lines[`${ci}-${bi}-${si}`] = { key: `synthetic-${ci}-${bi}-${si}`, durationMs: durMs, words };
    });
  });
});

const FPS = 30;
const tl = buildTimeline(manifest, FPS);
const hit = tl.beats.find((b) => b.beat.scene.type === 'statCards');
if (!hit) { console.error('no statCards beat'); process.exit(1); }
const groupStart = hit.startMs;

const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingQuality = 'high';
const TIMES = [1800, 2100, 2400, 2600, 2900, 3300, 3800, 4500, 5000];
const PREFIX = process.argv.includes('--before') ? 'SITBEFORE' : 'SITAFTER';
for (const gt of TIMES) {
  drawFrame(ctx, tl, groupStart + gt, {
    captions: 'karaoke',
    channelName: 'The Data Desk',
    nextVideoTitle: 'The 7 Companies That ARE the Market',
    watermark: true,
    progressBar: true,
  });
  fs.writeFileSync(path.join(OUT, `${PREFIX}-${gt}.png`), canvas.toBuffer('image/png'));
  console.log(`${PREFIX}-${gt}.png  (group t=${gt}ms)`);
}
