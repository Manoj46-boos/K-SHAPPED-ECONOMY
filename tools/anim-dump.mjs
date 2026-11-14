// Find group start times for walk entrances + dump consecutive animation frames
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

// group starts with entrance walks (host scenes with entrance==='walk')
// rebuild computeGroups approximation: consecutive same sceneKey runs packed at 12s
const W = 1920, H = 1080;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// find a host beat with walk entrance mid-run: scan beats, find scene.type==='host' whose
// scene.entrance==='walk'; take the SECOND such group so fade is done; dump 8 frames at 30fps
const hostBeats = tl.beats.filter((b) => b.beat.scene.type === 'host');
console.log('host beats:', hostBeats.length);
const walkBeat = hostBeats.find((b, i) => i > 0 && (b.beat.scene.entrance === 'walk'));
const t0 = walkBeat ? walkBeat.startMs : hostBeats[0].startMs;
console.log('walk entrance beat at', t0, 'entrance:', walkBeat && walkBeat.beat.scene.entrance);

// dump 8 consecutive frames at 33ms from t0+700ms (mid-walk, past the 300ms fade)
fs.mkdirSync(path.join(REPO, 'anim'), { recursive: true });
for (let i = 0; i < 8; i++) {
  const t = t0 + 700 + i * 33;
  drawFrame(ctx, tl, t, OPTS);
  fs.writeFileSync(path.join(REPO, 'anim', `w${i}.png`), canvas.toBuffer('image/png'));
}
// also: gesture accent frames during a speaking hold (8 frames, 40ms apart)
const holdBeat = hostBeats.find((b, i) => i > 3);
const t1 = holdBeat.startMs + (holdBeat.endMs - holdBeat.startMs) * 0.45;
for (let i = 0; i < 8; i++) {
  const t = t1 + i * 40;
  drawFrame(ctx, tl, t, OPTS);
  fs.writeFileSync(path.join(REPO, 'anim', `g${i}.png`), canvas.toBuffer('image/png'));
}
console.log('dumped anim frames around', t0, t1);
