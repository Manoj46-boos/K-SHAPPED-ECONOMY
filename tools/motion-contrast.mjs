/**
 * motion-contrast.mjs — 100-JUDGE DOSSIER (P3) VERIFICATION INSTRUMENT.
 *
 * The deferral's honest blocker was: "the hero-moment 2-3x motion contrast
 * is invisible in stills — my verification pipeline proves single frames,
 * not motion." This tool proves MOTION: it renders N consecutive frames
 * (33ms apart, the 30fps film clock) across HERO windows and QUIET windows
 * of the real timeline, measures the mean inter-frame pixel change at the
 * 160x90 feed register (novelty-audit's own comparator), and gates the
 * dossier's law:
 *
 *   every hero window must move >= 2.0x the mean quiet window.
 *
 * PASS: exit 0, the ratio table printed.  FAIL: exit 1 with the failing
 * window named — the beat's amplification is sub-threshold, fix the curves.
 *
 * Usage:  node tools/motion-contrast.mjs [--ratio 2.0] [--out report.json]
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
const RATIO_FLOOR = Number(arg('ratio', 2.0));

if (!fs.existsSync(path.join(BUILD, 'director.js'))) {
  const files = [
    'theme', 'easing', 'effects', 'particles', 'stickman', 'stickman-v2', 'charts', 'textfx',
    'collision', 'scene-context', 'scene-props', 'scenes-host', 'scenes-data', 'scenes-text',
    'analytics', 'script-data', 'timeline', 'director', 'thumbnail', 'shorts',
  ].map((f) => path.join(REPO, 'src', 'lib', 'engine', f + '.ts'));
  execSync(
    ['node_modules/.bin/tsc', ...files.filter((f) => fs.existsSync(f)),
     '--outDir', BUILD, '--module', 'commonjs', '--moduleResolution', 'node',
     '--target', 'es2022', '--skipLibCheck', '--esModuleInterop', '--resolveJsonModule'].join(' '),
    { stdio: 'inherit', cwd: REPO }
  );
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
  const out = []; let t = 0;
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
const CW = 160, CH = 90; // the feed-register comparator (novelty-audit's own)
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingQuality = 'high';
const cmp = createCanvas(CW, CH);
const cctx = cmp.getContext('2d');

const snap = (tMs) => {
  drawFrame(ctx, tl, tMs, OPTS);
  cctx.imageSmoothingQuality = 'high';
  cctx.drawImage(canvas, 0, 0, CW, CH);
  return new Float32Array(cctx.getImageData(0, 0, CW, CH).data);
};
const meanDiff = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};

/** Mean consecutive-frame change across [from, from+lenMs] at 33ms steps. */
function windowMotion(fromMs, lenMs, frames = 12) {
  const step = 33;
  let prev = snap(fromMs);
  let acc = 0;
  let n = 0;
  for (let k = 1; k < frames; k++) {
    const cur = snap(fromMs + k * step);
    acc += meanDiff(prev, cur);
    n++;
    prev = cur;
  }
  void lenMs;
  return acc / Math.max(1, n);
}

const beatOf = (type, nth = 0) => {
  const hits = tl.beats.filter((b) => b.beat.scene.type === type);
  return hits[Math.min(nth, hits.length - 1)];
};

// ── the windows ──────────────────────────────────────────────────────────────
// HERO: the four slams the dossier names (bigText, stampCard, the cold-open
// tear, the paradox strike) — each sampled across its impact window.
// QUIET: four mid-scene holds AFTER the entry settle and BEFORE the mid-group
// reframe — the "nearly still" register the quiet half of P3 shipped.
const heroes = [];
{
  const bt = beatOf('bigText');
  if (bt) heroes.push({ name: 'bigText slam', from: bt.startMs + 300 });
  const st = beatOf('stampCard');
  if (st) heroes.push({ name: 'stampCard slam', from: st.startMs + 480 });
  const op = beatOf('divergeK', 0);
  if (op && op.beat.scene.opening) heroes.push({ name: 'cold-open tear', from: op.startMs + 5900 });
  const px = beatOf('paradoxResolve');
  if (px) heroes.push({ name: 'paradox strike', from: px.startMs + 1380 });
}
const quiets = [];
{
  const sp = beatOf('splitNumbers', 1);
  if (sp) quiets.push({ name: 'splitNumbers vs hold', from: sp.startMs + 3600 });
  const ct = beatOf('chartTwin');
  if (ct) quiets.push({ name: 'chartTwin hold', from: ct.startMs + 3600 });
  const dg = beatOf('dotGrid');
  if (dg) quiets.push({ name: 'dotGrid hold', from: dg.startMs + 3600 });
  const gq = beatOf('recessionGauge');
  if (gq) quiets.push({ name: 'gauge hold', from: gq.startMs + 3600 });
}

console.log(`motion-contrast · ${heroes.length} hero windows · ${quiets.length} quiet windows · floor ratio ${RATIO_FLOOR}`);
const rows = [];
let quietMean = 0;
for (const q of quiets) {
  const d = windowMotion(q.from, 0);
  rows.push({ kind: 'quiet', name: q.name, d: +d.toFixed(3) });
  quietMean += d;
  console.log(`  QUIET  ${q.name.padEnd(24)} motion ${d.toFixed(3)}`);
}
quietMean = quietMean / Math.max(1, quiets.length);
let fails = 0;
for (const h of heroes) {
  const d = windowMotion(h.from, 0);
  const ratio = d / Math.max(0.0001, quietMean);
  const ok = ratio >= RATIO_FLOOR;
  if (!ok) fails++;
  rows.push({ kind: 'hero', name: h.name, d: +d.toFixed(3), ratio: +ratio.toFixed(2), ok });
  console.log(`  HERO   ${h.name.padEnd(24)} motion ${d.toFixed(3)}  ratio ${ratio.toFixed(2)}x  ${ok ? 'PASS' : 'FAIL'}`);
}
console.log(`quiet mean ${quietMean.toFixed(3)} — the contrast floor every hero window must clear at ${RATIO_FLOOR}x`);
const outPath = arg('out', path.join(REPO, 'motion-contrast.json'));
fs.writeFileSync(outPath, JSON.stringify({ ratioFloor: RATIO_FLOOR, quietMean: +quietMean.toFixed(4), rows, fails }, null, 2));
console.log(`report → ${outPath}`);
if (fails) {
  console.error(`\n✗ MOTION CONTRAST FAILED: ${fails}/${heroes.length} hero windows under ${RATIO_FLOOR}x the quiet register — amplify the beat curves, not the numbers.`);
  process.exit(1);
}
console.log('\nmotion-contrast: PASS — the hero beats move at the dossier ratio.');
