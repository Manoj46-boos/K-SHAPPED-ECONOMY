// Phase 2 item 4 evidence: a 7-frame SCRUB STRIP across the c8-fund
// reaction window start (the TWIST) — the take() grammar fires there:
// hold (2 frames) → 20% brow overshoot + blink + head-torso bounce.
// Frames: r0-120 (pre), r0, +66, +140, +200, +280, +380 (the take's own
// timeline) + a late settle frame. BEFORE tree: no take — the host holds
// the blend envelope only. Run: node tools/take-scrub.mjs [--before]
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

const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));
const { drawFrame } = require(path.join(BUILD, 'director.js'));
const { REACTIONS } = require(path.join(BUILD, 'scene-context.js'));

function estWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = []; let t = 0;
  for (const w of words) {
    const d = Math.min(650, 180 + w.length * 38);
    out.push({ t: Math.round(t), d: Math.round(d), w }); t += d + 45;
  }
  return { words: out, durMs: Math.round(t) };
}

const manifest = { lines: {} };
SCRIPT.forEach((chapter, ci) => chapter.beats.forEach((beat, bi) =>
  splitSentences(beat.vo).forEach((text, si) => {
    const { words, durMs } = estWords(text);
    manifest.lines[`${ci}-${bi}-${si}`] = { key: `synthetic-${ci}-${bi}-${si}`, durationMs: durMs, words };
  })));

const tl = buildTimeline(manifest, 30);
const g = tl.beats.find((b) => b.beat.scene.sceneKey === 'c8-fund');
const groupStart = g.startMs;
const d = g.endMs - g.startMs;
// reactionStart math (scene-context.ts): clamped exactly
const spec = REACTIONS['c8-fund'];
const dur = Math.min(spec.durMs, Math.max(900, d * 0.3));
let start = Math.max(1400, d * spec.atFrac);
start = Math.min(start, Math.max(800, d - dur - 250));
const r0 = groupStart + start;
console.log(`c8-fund reaction start: group+${Math.round(start)}ms (abs ${Math.round(r0)}ms), window ${Math.round(dur)}ms`);

const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingQuality = 'high';
const OFFSETS = [-150, 0, 66, 140, 200, 280, 380];
const PREFIX = process.argv.includes('--before') ? 'TAKEBEFORE' : 'TAKEAFTER';
for (const off of OFFSETS) {
  drawFrame(ctx, tl, r0 + off, {
    captions: 'karaoke',
    channelName: 'The Data Desk',
    nextVideoTitle: 'The 7 Companies That ARE the Market',
    watermark: true,
    progressBar: true,
  });
  fs.writeFileSync(path.join(OUT, `${PREFIX}-${off >= 0 ? '' : 'm'}${Math.abs(off)}.png`), canvas.toBuffer('image/png'));
  console.log(`${PREFIX}-${off}.png  (r0${off >= 0 ? '+' : ''}${off}ms)`);
}
