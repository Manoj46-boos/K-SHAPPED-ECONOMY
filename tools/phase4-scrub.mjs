// Phase 4 evidence scrub — three strips:
//   (1) LIGHT SHAFT: a host scene where the host crosses the shaft — the
//       plate darkens on the far side (BEFORE: no darkening).
//   (2) RHYTHM: a long host run at 12s+ — the seam frame shows the
//       reframe (new camera punch/entry) vs the old continuous hold.
//   (3) WASH: same beat, chapter tones at 5-11% vs 15-20%.
// Run with --before on the Phase-3 tree (54e016e).
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
  console.error('run render-check first');
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

function estWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = []; let t = 0;
  for (const w of words) {
    const d = Math.min(420, 180 + w.length * 26);
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
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingQuality = 'high';
const OPTS = {
  captions: 'karaoke', channelName: 'The Data Desk',
  nextVideoTitle: 'The 7 Companies That ARE the Market',
  watermark: true, progressBar: true,
};
const PREFIX = process.argv.includes('--before') ? 'P4BEFORE' : 'P4AFTER';

// ── (1) LIGHT SHAFT — a mid-chapter host scene (the host is beside the
// shaft; the crossing fires when his body overlaps the beam band) ──
{
  // any host beat in ch2 (the market) — host right side near W*0.68 beam
  const hosts = tl.beats.filter((b) => b.beat.scene.type === 'host' && b.chapter === 1);
  const b = hosts[0];
  if (b) {
    for (const off of [2000, 4000, 6000, 8000]) {
      drawFrame(ctx, tl, b.startMs + off, OPTS);
      fs.writeFileSync(path.join(OUT, `${PREFIX}-shaft-${off}.png`), canvas.toBuffer('image/png'));
      console.log(`${PREFIX}-shaft-${off}.png`);
    }
  } else {
    // fallback: any host
    const b2 = tl.beats.find((x) => x.beat.scene.type === 'host');
    for (const off of [2000, 4000, 6000, 8000]) {
      drawFrame(ctx, tl, b2.startMs + off, OPTS);
      fs.writeFileSync(path.join(OUT, `${PREFIX}-shaft-${off}.png`), canvas.toBuffer('image/png'));
      console.log(`${PREFIX}-shaft-${off}.png`);
    }
  }
}

// ── (2) RHYTHM — the 12s cap: a long scene run's seam frame ──
// c3-mood runs long host beats; the scrub samples around a mid-run seam:
// BEFORE tree: gt is continuous (one long group); AFTER: sub-groups.
{
  const b = tl.beats.find((x) => x.beat.scene.type === 'host' && x.endMs - x.startMs > 13000);
  const target = b || tl.beats.find((x) => x.beat.scene.type === 'host');
  // sample across the beat: early, the 12s mark, past it
  const dur = target.endMs - target.startMs;
  for (const off of [Math.min(3000, dur), Math.min(9000, dur), Math.min(12000, dur - 1), Math.min(13000, dur - 1)]) {
    drawFrame(ctx, tl, target.startMs + off, OPTS);
    fs.writeFileSync(path.join(OUT, `${PREFIX}-rhythm-${off}.png`), canvas.toBuffer('image/png'));
    console.log(`${PREFIX}-rhythm-${off}.png`);
  }
}

// ── (3) WASH — same host beat; the tone journey deepens ──
{
  const b = tl.beats.find((x) => x.beat.scene.type === 'host');
  for (const off of [1500, 5000]) {
    drawFrame(ctx, tl, b.startMs + off, OPTS);
    fs.writeFileSync(path.join(OUT, `${PREFIX}-wash-${off}.png`), canvas.toBuffer('image/png'));
    console.log(`${PREFIX}-wash-${off}.png`);
  }
}
