/**
 * ghost-probe.mjs — find WHICH engine function draws in a target region by
 * wrapping the 2D context and capturing a call stack for every path op whose
 * coords land in the region. Usage:
 *   node tools/ghost-probe.mjs <sceneType> <nth> <frac>
 */
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
]) {
  registerFont(path.join(REPO, 'public', 'fonts', f), { family, weight: String(weight) });
}
globalThis.document = { createElement: () => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };

const W = 1920, H = 1080;
const realCanvas = createCanvas(W, H);
const realCtx = realCanvas.getContext('2d');
realCtx.imageSmoothingQuality = 'high';

const RX0 = 500, RX1 = 1750, RY0 = 380, RY1 = 510
const stacks = new Map();
let tracing = false;
const px = (v) => typeof v === 'number' && v >= RX0 && v <= RX1;
const py = (v) => typeof v === 'number' && v >= RY0 && v <= RY1;

const probe = new Proxy(realCtx, {
  get(target, prop) {
    const orig = target[prop];
    if (typeof orig !== 'function') return orig;
    return (...args) => {
      if (tracing && ['moveTo', 'lineTo', 'roundRect', 'arc', 'fillRect', 'strokeRect', 'rect', 'ellipse', 'fillText'].includes(prop)) {
        const hit = args.some((v, i) => (i % 2 === 0 || prop === 'roundRect' || prop === 'fillRect') && px(v)) &&
                    args.some((v, i) => (i % 2 === 1 || prop === 'roundRect' || prop === 'fillRect') && py(v));
        if (hit) {
          const lines = new Error().stack.split('\n').filter((l) => l.includes('director.js') || l.includes('scenes') || l.includes('theme.js') || l.includes('charts.js') || l.includes('effects.js') || l.includes('textfx.js'));
          const key = lines.slice(0, 4).join(' | ');
          if (!stacks.has(key)) stacks.set(key, prop + ' ' + args.slice(0, 4).map((n) => typeof n === 'number' ? Math.round(n) : n).join(','));
        }
      }
      return orig.apply(target, args);
    };
  },
  set(target, prop, value) { target[prop] = value; return true; }
});

const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));
const { drawFrame } = require(path.join(BUILD, 'director.js'));
const estWords = (text) => {
  let t = 0;
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    const d = Math.min(650, 180 + w.length * 38);
    out.push({ t: Math.round(t), d: Math.round(d), w });
    t += d + 45;
  }
  return { words: out, durMs: Math.round(t) };
};
const manifest = { lines: {} };
SCRIPT.forEach((chapter, ci) => {
  chapter.beats.forEach((beat, bi) => {
    splitSentences(beat.vo).forEach((text, si) => {
      const { words, durMs } = estWords(text);
      manifest.lines[`${ci}-${bi}-${si}`] = { key: `s-${ci}-${bi}-${si}`, durationMs: durMs, words };
    });
  });
});
const tl = buildTimeline(manifest, 30);
const OPTS = {
  captions: 'karaoke', channelName: 'The Data Desk',
  nextVideoTitle: 'The 7 Companies That ARE the Market',
  watermark: true, progressBar: true,
};
const sceneArg = process.argv[2] || 'chartJourney';
const nthArg = parseInt(process.argv[3] || '5', 10);
const fracArg = parseFloat(process.argv[4] || '0.7');
const beats = tl.beats.filter((b) => b.beat.scene.type === sceneArg);
const beat = beats[nthArg];
const tMs = beat.startMs + (beat.endMs - beat.startMs) * fracArg;
tracing = true;
drawFrame(probe, tl, tMs, OPTS);
tracing = false;
console.log(`--- draws in region x[${RX0},${RX1}] y[${RY0},${RY1}] @ ${sceneArg} t=${Math.round(tMs)} ---`);
for (const [k, v] of stacks) console.log('\n  OP:', v, '\n  AT:', k.replace(/\s+/g, ' '));
if (!stacks.size) console.log('(nothing drawn in the region)');