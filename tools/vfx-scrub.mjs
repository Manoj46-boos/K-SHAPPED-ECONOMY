// Phase 3 evidence scrub — three strips:
//   VFXAFTER: (1) the datacenter heat window, (2) the cold-open K-turn
//   window (4.6-6.2s), (3) the c8-fund reaction window (DOF + veil).
//   Same scrub with --before renders the pre-Phase-3 tree (stash).
// Run: node tools/vfx-scrub.mjs [--before]
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
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingQuality = 'high';
const OPTS = {
  captions: 'karaoke', channelName: 'The Data Desk',
  nextVideoTitle: 'The 7 Companies That ARE the Market',
  watermark: true, progressBar: true,
};
const PREFIX = process.argv.includes('--before') ? 'VFXBEFORE' : 'VFXAFTER';

// (1) HEAT: the datacenter group, +1s..+6s (shimmer rising off the racks)
{
  const b = tl.beats.find((x) => x.beat.scene.type === 'aiDatacenter');
  for (const off of [1000, 2500, 4000, 5500]) {
    drawFrame(ctx, tl, b.startMs + off, OPTS);
    fs.writeFileSync(path.join(OUT, `${PREFIX}-heat-${off}.png`), canvas.toBuffer('image/png'));
    console.log(`${PREFIX}-heat-${off}.png`);
  }
}
// (2) K-TURN: the cold-open (c1-k-open, starts at t=0) — the face lands
// at t≈6.07s, the axis sweeps 30→95 through 6.07-6.97s, the tear fires
// ~7.13s, settles after. Scrub: face-born, mid-sweep, full-95°, tear.
{
  const b = tl.beats.find((x) => x.beat.scene.sceneKey === 'c1-k-open');
  for (const off of [6100, 6300, 6500, 6900, 7100, 7500]) {
    drawFrame(ctx, tl, b.startMs + off, OPTS);
    fs.writeFileSync(path.join(OUT, `${PREFIX}-kturn-${off}.png`), canvas.toBuffer('image/png'));
    console.log(`${PREFIX}-kturn-${off}.png`);
  }
}
// (3) DOF: the c8-fund reaction window — the twist's push blurs the world
{
  const g = tl.beats.find((x) => x.beat.scene.sceneKey === 'c8-fund');
  const d = g.endMs - g.startMs;
  const spec = REACTIONS['c8-fund'];
  const dur = Math.min(spec.durMs, Math.max(900, d * 0.3));
  let start = Math.max(1400, d * spec.atFrac);
  start = Math.min(start, Math.max(800, d - dur - 250));
  const r0 = g.startMs + start;
  for (const off of [-200, 300, 600, 900]) {
    drawFrame(ctx, tl, r0 + off, OPTS);
    fs.writeFileSync(path.join(OUT, `${PREFIX}-dof-${off >= 0 ? '' : 'm'}${Math.abs(off)}.png`), canvas.toBuffer('image/png'));
    console.log(`${PREFIX}-dof-${off}.png  (r0${off >= 0 ? '+' : ''}${off})`);
  }
}
