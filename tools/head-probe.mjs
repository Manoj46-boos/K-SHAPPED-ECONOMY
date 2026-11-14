// Numeric probe: where does the host's head land on y in host/editorial framings?
// Renders frames and reports the topmost dark-ink pixel in the host's x-column.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas, registerFont } from 'canvas';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
SCRIPT.forEach((chapter, ci) => chapter.beats.forEach((beat, bi) => {
  splitSentences(beat.vo).forEach((text, si) => {
    const { words, durMs } = estWords(text);
    manifest.lines[`${ci}-${bi}-${si}`] = { key: `s-${ci}-${bi}-${si}`, durationMs: durMs, words };
  });
}));
const tl = buildTimeline(manifest, 30);
const OPTS = { captions: 'karaoke', channelName: 'The Data Desk', nextVideoTitle: 'x', watermark: true, progressBar: true };
const W = 1920, H = 1080;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

function probe(t, label) {
  drawFrame(ctx, tl, t, OPTS);
  const d = ctx.getImageData(0, 0, W, H).data;
  // dark ink pixels (r,g,b all < 90) — the host's limbs/head contour
  const cols = {};
  for (let y = 0; y < H; y += 1) {
    for (let x = 300; x < 1600; x += 2) {
      const i = (y * W + x) * 4;
      if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) {
        cols[x] = cols[x] ?? y; // first dark pixel per column (topmost)
        break;
      }
    }
  }
  const ys = Object.values(cols);
  const top = ys.length ? Math.min(...ys) : -1;
  console.log(`${label}: topmost dark ink at y=${top}  (negative/0 == head clipped by frame top), columns ${ys.length}`);
}

const hostBeats = tl.beats.filter((b) => b.beat.scene.type === 'host');
// the editorial host beat (hostSceneV2 with headline) — first few
hostBeats.slice(0, 4).forEach((b, i) => {
  probe(b.startMs + (b.endMs - b.startMs) * 0.5, `host beat #${i} (ch${b.chapter + 1}) @50%`);
});
probe(875728, 'gesture hold t=875728');
