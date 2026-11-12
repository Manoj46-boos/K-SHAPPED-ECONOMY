/**
 * novelty-audit.mjs — AUDIT-ROUND-2 fix 26 (the retention machinery).
 *
 * "A companion to render-check: renders frames on a 1s grid, computes
 * pixel-difference against the previous second, flags any window where
 * nothing visibly changes for more than 3 seconds. Every flagged window
 * is a swipe risk — fix with a chart draw, a prop pop, a camera move or
 * a cut."
 *
 * Usage:
 *   node tools/novelty-audit.mjs [--step 1000] [--out report.json]
 *                                [--cut first] [--max-sec N] [--rebuild]
 *
 * Free, deterministic, renders in ~1-2 min on the 8 GB Dell (a 1s grid =
 * ~750 frames at 160×90 compare resolution). Exit code 1 if any ≥3s dead
 * window is found — wire it before every upload, next to the feed gate.
 */
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas, registerFont } from 'canvas';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(REPO, '.render-check-build');

const arg = (name, def = undefined) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const flag = (name) => process.argv.includes(`--${name}`);

if (flag('rebuild') || !fs.existsSync(path.join(BUILD, 'director.js'))) {
  const files = [
    'theme', 'easing', 'effects', 'stickman', 'stickman-v2', 'charts', 'textfx',
    'collision', 'scene-context', 'scene-props', 'scenes-host', 'scenes-data', 'scenes-text',
    'analytics', 'script-data', 'timeline', 'director', 'thumbnail', 'shorts',
  ].map((f) => path.join(REPO, 'src', 'lib', 'engine', f + '.ts'));
  execSync(
    ['node_modules/.bin/tsc', ...files,
     '--outDir', BUILD, '--module', 'commonjs', '--moduleResolution', 'node',
     '--target', 'es2022', '--skipLibCheck', '--esModuleInterop', '--resolveJsonModule'].join(' '),
    { stdio: 'inherit', cwd: REPO }
  );
}

for (const [f, family, weight] of [
  ['Inter-400.ttf', 'Inter', 400], ['Inter-600.ttf', 'Inter', 600], ['Inter-700.ttf', 'Inter', 700],
  ['Fraunces-400.ttf', 'Fraunces', 400], ['Fraunces-600.ttf', 'Fraunces', 600], ['Fraunces-700.ttf', 'Fraunces', 700],
]) {
  registerFont(path.join(REPO, 'public', 'fonts', f), { family, weight: String(weight) });
}
globalThis.document = { createElement: () => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };

// fix 28 companion: the audit's first cut renders through the same flag
const CUT = flag('cut') ? arg('cut', 'first') : null;
const sd = require(path.join(BUILD, 'script-data.js'));
let scriptSrc = sd.SCRIPT;
if (CUT === 'first') {
  if (typeof sd.FIRST_UPLOAD_CUT === 'undefined') {
    console.error('[novelty-audit] no FIRST_UPLOAD_CUT in this build — run --rebuild');
    process.exit(1);
  }
  sd.SCRIPT = sd.FIRST_UPLOAD_CUT;
  scriptSrc = sd.FIRST_UPLOAD_CUT;
}

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
scriptSrc.forEach((chapter, ci) => {
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

const W = 1920, H = 1080;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingQuality = 'high';
// compare resolution — 160×90: the "nothing visibly changes" register at
// feed scale (a 320px feed frame is 320×180; we sample coarser on purpose:
// if nothing changes at 160×90, nothing changes on a phone)
const CW = 160, CH = 90;
const cmp = createCanvas(CW, CH);
const cctx = cmp.getContext('2d');

const step = Number(arg('step', 1000));
const maxSec = Number(arg('max-sec', Math.ceil(tl.durationMs / 1000)));
const THRESH = 0.55;           // mean abs 0..255 diff per sample below this = "no visible change"
const DEAD_WINDOW_SEC = 3;     // the audit's swipe-risk threshold

function snapAt(tMs) {
  drawFrame(ctx, tl, tMs, OPTS);
  cctx.imageSmoothingQuality = 'high';
  cctx.drawImage(canvas, 0, 0, CW, CH);
  const d = cctx.getImageData(0, 0, CW, CH).data;
  const out = new Float32Array(CW * CH * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    out[j] = d[i]; out[j + 1] = d[i + 1]; out[j + 2] = d[i + 2];
  }
  return out;
}

function meanDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

// ── 1. the 1s novelty grid ─────────────────────────────────────────────────
console.log(`novelty audit · timeline ${(tl.durationMs / 60000).toFixed(1)} min · 1s grid · threshold ${THRESH}`);
const diffs = [];
let prev = null;
for (let t = 0; t < tl.durationMs && t / 1000 <= maxSec; t += step) {
  const cur = snapAt(t);
  const d = prev ? meanDiff(prev, cur) : 255;
  diffs.push({ t, d });
  prev = cur;
}

// ── 2. flag every ≥3s dead window ──────────────────────────────────────────
const dead = [];
let run = [];
for (const { t, d } of diffs) {
  if (d < THRESH) run.push(t);
  else {
    if (run.length * (step / 1000) >= DEAD_WINDOW_SEC) dead.push(run);
    run = [];
  }
}
if (run.length * (step / 1000) >= DEAD_WINDOW_SEC) dead.push(run);

// ── 3. the first-30s event map (fix 29 evidence: hook cadence) ──────────────
const events30 = [];
{
  // hard cuts in the first 30s + the scene types they land on
  for (const cut of tl.cutTimes) {
    if (cut > 30000) continue;
    let type = '';
    for (const b of tl.beats) if (cut >= b.startMs && cut < b.endMs) type = b.beat.scene.type;
    events30.push({ tMs: cut, kind: 'hard-cut', type });
  }
  // novelty spikes ≥ 6 (the visible-change moments the thumb needs)
  for (const { t, d } of diffs) {
    if (t <= 30000 && d >= 6) events30.push({ tMs: t, kind: 'visible-change', d: +d.toFixed(2) });
  }
  events30.sort((a, b) => a.tMs - b.tMs);
}

// ── 4. report ───────────────────────────────────────────────────────────────
const report = {
  timelineMin: +(tl.durationMs / 60000).toFixed(2),
  stepMs: step,
  threshold: THRESH,
  deadWindowsMs: dead.map((r) => ({ from: r[0], to: r[r.length - 1] + step, sec: r.length * step / 1000 })),
  first30s: {
    eventCount: events30.filter((e) => e.kind === 'hard-cut').length,
    visibleChangeCount: events30.filter((e) => e.kind === 'visible-change').length,
    events: events30,
  },
};
const outPath = arg('out', path.join(REPO, 'novelty-report.json'));
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`dead windows (≥${DEAD_WINDOW_SEC}s of no visible change): ${dead.length}`);
for (const r of dead) {
  console.log(`  ⚠ ${(r[0] / 1000).toFixed(0)}s → ${((r[r.length - 1] + step) / 1000).toFixed(0)}s (${(r.length * step / 1000).toFixed(0)}s) — swipe risk: fix with a chart draw, prop pop, camera move or cut`);
}
console.log(`first 30s: ${report.first30s.eventCount} hard cuts · ${report.first30s.visibleChangeCount} visible-change seconds`);
console.log(`report → ${outPath}`);
if (dead.length) process.exit(1);
