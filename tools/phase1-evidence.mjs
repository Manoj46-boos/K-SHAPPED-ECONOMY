/**
 * Phase 1 evidence — renders the BEFORE/AFTER frame set for the four
 * character-to-scene fixes (100-judge audit report §6 Phase 1):
 *
 *   fix1  contact verbs  — chartTwin, kDef, statCards, credibilityChips,
 *                          barsCompare, dotGrid (refusal), recessionGauge
 *                          (new host), gasPump (new host), paradoxResolve,
 *                          recapSplit, bigText
 *   fix2  shared ground  — ownerWorker (one terrain plane, gaze lines)
 *   fix3  owned props    — ownerWorker coin flow
 *   fix4  shorts restage — the vertical frame's big center host
 *
 * Usage:
 *   node tools/phase1-evidence.mjs <outdir> <prefix> [--rebuild]
 * Produces <outdir>/<prefix><name>.png for every probe below.
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
const OUTDIR = path.isAbsolute(process.argv[2] || '')
  ? process.argv[2]
  : path.resolve(REPO, '..', process.argv[2] || 'evidence/phase1');
const PREFIX = process.argv[3] || '';
const flag = (n) => process.argv.includes(`--${n}`);

fs.mkdirSync(OUTDIR, { recursive: true });

if (flag('rebuild') || !fs.existsSync(path.join(BUILD, 'director.js'))) {
  const files = [
    'theme', 'easing', 'effects', 'particles', 'stickman', 'stickman-v2', 'charts', 'textfx',
    'collision', 'scene-context', 'scene-props', 'scenes-host', 'scenes-data', 'scenes-text',
    'analytics', 'script-data', 'timeline', 'director', 'thumbnail', 'shorts',
  ].map((f) => path.join(REPO, 'src', 'lib', 'engine', f + '.ts'));
  const list = files.filter((f) => fs.existsSync(f));
  execSync(['node_modules/.bin/tsc', ...list,
    '--outDir', BUILD, '--module', 'commonjs', '--moduleResolution', 'node',
    '--target', 'es2022', '--skipLibCheck', '--esModuleInterop', '--resolveJsonModule'].join(' '),
    { stdio: 'inherit', cwd: REPO });
}

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
const OPTS = {
  captions: 'karaoke', channelName: 'The Data Desk',
  nextVideoTitle: 'The 7 Companies That ARE the Market',
  watermark: true, progressBar: true,
};

const W = 1920, H = 1080;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingQuality = 'high';

function beatTime(type, nth = 0, frac = 0.55) {
  const hits = tl.beats.filter((b) => b.beat.scene.type === type);
  const b = hits[Math.min(nth, hits.length - 1)];
  if (!b) throw new Error(`no beat of type ${type}`);
  return b.startMs + (b.endMs - b.startMs) * frac;
}

function render(name, tMs) {
  drawFrame(ctx, tl, Math.round(tMs), OPTS);
  const p = path.join(OUTDIR, `${PREFIX}${name}.png`);
  fs.writeFileSync(p, canvas.toBuffer('image/png'));
  console.log('saved', path.basename(p), '@', Math.round(tMs), 'ms');
}

function renderShort(name, idx, tOff) {
  const { drawShortFrame, pickShortMoments } = require(path.join(BUILD, 'shorts.js'));
  const shorts = pickShortMoments(tl);
  const spec = shorts[idx];
  if (!spec) throw new Error(`no short #${idx}`);
  const sc = createCanvas(1080, 1920);
  drawShortFrame(sc.getContext('2d'), canvas, tl, spec, spec.startMs + tOff, OPTS);
  const p = path.join(OUTDIR, `${PREFIX}${name}.png`);
  fs.writeFileSync(p, sc.toBuffer('image/png'));
  console.log('saved', path.basename(p), `(short ${idx} @ +${tOff}ms, native=${spec.native})`);
}

// ── fix1: contact verbs ──────────────────────────────────────────────────────
render('fix1-charttwin', beatTime('chartTwin', 0, 0.6));
render('fix1-kdef', beatTime('kDef', 0, 0.62));
render('fix1-statcards', beatTime('statCards', 0, 0.6));
render('fix1-credchips', beatTime('credibilityChips', 0, 0.72));
render('fix1-barscompare', beatTime('barsCompare', 0, 0.6));
render('fix1-dotgrid', beatTime('dotGrid', 0, 0.78));
render('fix1-gauge', beatTime('recessionGauge', 2, 0.7));
render('fix1-gaspump', beatTime('gasPump', 0, 0.72));
render('fix1-paradox', beatTime('paradoxResolve', 0, 0.72));
render('fix1-recap', beatTime('recapSplit', 0, 0.62));
render('fix1-bigtext', beatTime('bigText', 0, 0.62));

// ── fix2: shared ground plane + gaze ────────────────────────────────────────
render('fix2-ownerworker', beatTime('ownerWorker', 0, 0.75));

// ── fix3: owned coin flow ────────────────────────────────────────────────────
render('fix3-coinflow', beatTime('ownerWorker', 0, 0.42));

// ── fix4: the vertical re-stage ──────────────────────────────────────────────
renderShort('fix4-shorts-entry', 0, 2200);
renderShort('fix4-shorts-host', 0, 12000);
renderShort('fix4-shorts-pump', 5, 10000);

console.log('done ->', OUTDIR);
