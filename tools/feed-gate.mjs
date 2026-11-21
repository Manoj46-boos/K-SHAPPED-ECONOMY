#!/usr/bin/env node
/* tools/feed-gate.mjs — P2 U13 (Visual Quality Audit §4.4 — THE 320-GATE AS CI).
 * Every gates run answers the report's three feed questions on the 320px
 * twin of a representative frame sample:
 *   Q1  a character someone could name in 3 seconds
 *   Q2  one readable number
 *   Q3  one bright mass and one dark mass
 * Exit 1 on any failure so `npm run gates` blocks the transcode. */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createCanvas, registerFont } from 'canvas';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(REPO, '.render-check-build');

for (const [f, family, weight] of [
  ['Inter-400.ttf', 'Inter', 400], ['Inter-600.ttf', 'Inter', 600], ['Inter-700.ttf', 'Inter', 700],
  ['Fraunces-400.ttf', 'Fraunces', 400], ['Fraunces-600.ttf', 'Fraunces', 600], ['Fraunces-700.ttf', 'Fraunces', 700],
]) registerFont(path.join(REPO, 'public', 'fonts', f), { family, weight: String(weight) });
globalThis.document = { createElement: () => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };

const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));
const { drawFrame } = require(path.join(BUILD, 'director.js'));

function estWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = []; let t = 0;
  for (const w of words) { const d = Math.min(650, 180 + w.length * 38); out.push({ t: Math.round(t), d: Math.round(d), w }); t += d + 45; }
  return { words: out, durMs: Math.round(t) };
}
const manifest = { lines: {} };
SCRIPT.forEach((ch, ci) => ch.beats.forEach((beat, bi) => {
  splitSentences(beat.vo).forEach((text, si) => {
    const { words, durMs } = estWords(text);
    manifest.lines[`${ci}-${bi}-${si}`] = { key: `s-${ci}-${bi}-${si}`, durationMs: durMs, words };
  });
}));
const tl = buildTimeline(manifest, 30);
const OPTS = { captions: 'karaoke', channelName: 'The Data Desk', nextVideoTitle: 'x', watermark: true, progressBar: false };

// the representative sample: hero close-up, data rooms, walkers, reactions,
// the card land, the cold open, the flip
const SAMPLE = [
  ['coldopen-shock', 2900], ['hero-closeup', 74200], ['flip', 231300],
  ['pie', 148500], ['gauge-walker', 553800], ['paradox', 845500],
  ['fund', 906800], ['card-land', 659600], ['takeaway', 1022000],
];

function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

let failures = 0;
const outDir = path.join(REPO, 'evidence', 'feed320');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, t] of SAMPLE) {
  const cc = createCanvas(1920, 1080);
  drawFrame(cc.getContext('2d'), tl, t, OPTS);
  const twin = createCanvas(320, 180);
  const tx = twin.getContext('2d');
  tx.imageSmoothingEnabled = true;
  tx.drawImage(cc, 0, 0, 1920, 1080, 0, 0, 320, 180);
  fs.writeFileSync(path.join(outDir, `gate-${name}.png`), twin.toBuffer('image/png'));
  const { data, width: W, height: H } = tx.getImageData(0, 0, 320, 180);
  let darkMid = 0, gold = 0, darkAll = 0, bright = 0, total = W * H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const L = luma(r, g, b);
      if (L < 80) darkAll++;
      if (L > 150) bright++;
      if (L < 90 && x > W * 0.12 && x < W * 0.88 && y > H * 0.18 && y < H * 0.85) darkMid++;
      if (r > 150 && g > 105 && b < 100 && r - b > 60) gold++;
    }
  }
  const q1 = darkMid / total >= 0.0075;                   // a nameable figure: the human mass (the cast tier 1.25+ reads 0.8-4% at the twin)
  const q2 = gold / total >= 0.002 || darkAll / total >= 0.02; // a readable number: the numeral language
  const q3 = bright / total >= 0.5 && darkAll / total >= 0.008; // one bright + one dark mass
  const ok = q1 && q2 && q3;
  if (!ok) failures++;
  console.log(`${ok ? '  ok' : 'FAIL'} ${name.padEnd(14)}  figure ${(darkMid / total * 100).toFixed(1)}%  gold ${(gold / total * 100).toFixed(2)}%  dark ${(darkAll / total * 100).toFixed(1)}%  bright ${(bright / total * 100).toFixed(0)}%`);
}
if (failures > 0) {
  console.error(`feed-gate: ${failures}/${SAMPLE.length} frames FAIL the three feed questions`);
  process.exit(1);
}
console.log('feed-gate: all sample frames pass the three feed questions on the 320 twin');
