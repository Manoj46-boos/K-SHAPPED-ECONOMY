/**
 * Render harness — draws real engine frames offline with node-canvas.
 * Builds a synthetic TTS manifest (word timings approximated) so the full
 * timeline + director + every scene drawer runs exactly as in the browser.
 *
 * Usage (one-time deps):  npm i -D canvas
 * Run:                    node tools/render-check.mjs
 * Output:                 ./harness-frames/*.png  (~20 frames, ~7 seconds)
 *
 * PANEL-9 B1 (tooling): this file is ESM by extension but previously used
 * CommonJS require() — `node tools/render-check.mjs` crashed with
 * ERR_REQUIRE_ESM / MODULE_NOT_FOUND before drawing a single frame. It is
 * now real ESM (createRequire for the compiled engine build, which is CJS).
 *
 * The engine is compiled to CommonJS into .render-check-build/ automatically
 * on first run (needs the repo's TypeScript: it ships as a devDependency).
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
const OUT = path.join(REPO, 'harness-frames');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ── one-time engine compile (scene/render modules only — no browser deps) ───
if (!fs.existsSync(path.join(BUILD, 'director.js'))) {
  const files = [
    'theme', 'easing', 'effects', 'stickman', 'stickman-v2', 'charts', 'textfx',
    'scene-context', 'scene-props', 'scenes-host', 'scenes-data', 'scenes-text',
    'analytics', 'script-data', 'timeline', 'director',
  ].map((f) => path.join(REPO, 'src', 'lib', 'engine', f + '.ts'));
  execSync(
    ['node_modules/.bin/tsc', ...files,
     '--outDir', BUILD, '--module', 'commonjs', '--moduleResolution', 'node',
     '--target', 'es2022', '--skipLibCheck', '--esModuleInterop',
     // PANEL-9: analytics.ts imports analytics-data.json — without this flag
     // tsc exits 2 on the JSON import and the harness dies before rendering.
     '--resolveJsonModule'].join(' '),
    { stdio: 'inherit', cwd: REPO }
  );
}

// ── fonts: the exact OFL faces the engine ships ──────────────────────────────
const FONTS = [
  ['Inter-400.ttf', 'Inter', 400],
  ['Inter-600.ttf', 'Inter', 600],
  ['Inter-700.ttf', 'Inter', 700],
  ['Fraunces-400.ttf', 'Fraunces', 400],
  ['Fraunces-600.ttf', 'Fraunces', 600],
  ['Fraunces-700.ttf', 'Fraunces', 700],
];
for (const [f, family, weight] of FONTS) {
  registerFont(path.join(REPO, 'public', 'fonts', f), { family, weight: String(weight) });
}

// ── browser shims the engine expects ─────────────────────────────────────────
globalThis.document = { createElement: (tag) => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { const c = createCanvas(w, h); return c; } };

const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));
const { drawFrame } = require(path.join(BUILD, 'director.js'));
// v9 (report P0-1): the collision guard — every picked frame is asserted
// clean of caption-pill vs scene-content overlaps, and a full sweep runs
// unless disabled. The build FAILS (exit 1) if any violation ships.
const guard = fs.existsSync(path.join(BUILD, 'collision.js'))
  ? require(path.join(BUILD, 'collision.js'))
  : null;

// ── synthetic TTS manifest: ~150 wpm, word timings for captions/gestures ────
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
SCRIPT.forEach((chapter, ci) => {
  chapter.beats.forEach((beat, bi) => {
    splitSentences(beat.vo).forEach((text, si) => {
      const { words, durMs } = estWords(text);
      manifest.lines[`${ci}-${bi}-${si}`] = { key: `synthetic-${ci}-${bi}-${si}`, durationMs: durMs, words };
    });
  });
});

const FPS = 30;
const tl = buildTimeline(manifest, FPS);
console.log(`timeline: ${(tl.durationMs / 60000).toFixed(1)} min · ${tl.beats.length} beats · ${tl.totalFrames} frames`);

const W = 1920, H = 1080;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingQuality = 'high';

const OPTS = {
  captions: 'karaoke',
  channelName: 'The Data Desk',
  nextVideoTitle: 'The 7 Companies That ARE the Market',
  watermark: true,
  progressBar: true,
};

// ── pick frames: cold open, first data, each chapter's strongest moment ──────
const targets = [];
const t0 = Date.now();
let guardViolations = 0;

function render(name, tMs) {
  if (guard) {
    guard.collisionGuard.enabled = true;
    guard.resetGuard(name);
  }
  drawFrame(ctx, tl, tMs, OPTS);
  if (guard) {
    const vs = guard.collectViolations();
    if (vs.length) {
      guardViolations += vs.length;
      console.error(`  !! COLLISION GUARD — ${name}: ${vs.map((v) => v.id).join(', ')}`);
    }
  }
  const p = path.join(OUT, name);
  fs.writeFileSync(p, canvas.toBuffer('image/png'));
  return p;
}

// find beats by scene type
function beatTime(type, nth = 0) {
  const hits = tl.beats.filter((b) => b.beat.scene.type === type);
  const b = hits[Math.min(nth, hits.length - 1)];
  if (!b) return null;
  // pick ~55% into the beat so entries have settled
  return { t: b.startMs + (b.endMs - b.startMs) * 0.55, label: `ch${b.chapter + 1}-${b.beatIndex}` };
}

const picks = [
  ['01-coldopen-K', beatTime('divergeK', 0)],
  ['02-channelintro', beatTime('channelIntro', 0)],
  ['03-splitnumbers-vs', beatTime('splitNumbers', 1)],
  ['04-divergeK-named', beatTime('divergeK', 1)],
  ['05-chartTwin', beatTime('chartTwin', 0)],
  ['06-chartJourney', beatTime('chartJourney', 0)],
  ['07-pieChart', beatTime('pieChart', 0)],
  ['08-dotGrid', beatTime('dotGrid', 0)],
  ['09-bigText', beatTime('bigText', 0)],
  ['10-stampCard', beatTime('stampCard', 0)],
  ['11-gasPump', beatTime('gasPump', 0)],
  ['12-recessionGauge', beatTime('recessionGauge', 0)],
  ['13-aiDatacenter', beatTime('aiDatacenter', 0)],
  ['14-ownerWorker', beatTime('ownerWorker', 0)],
  ['15-fundSplit', beatTime('fundSplit', 0)],
  ['16-quoteCard', beatTime('quoteCard', 0)],
  ['17-takeaways', beatTime('takeaways', 1)],
  ['18-commentPrompt', beatTime('commentPrompt', 0)],
  ['19-endScreen', beatTime('endScreen', 0)],
];

// a chapter-card frame (transition moment)
const cc = tl.chapterCards[2];
if (cc) {
  targets.push(render('20-chaptercard.png', cc.startMs + 450));
}

for (const [name, r] of picks) {
  if (!r) { console.log('skip', name); continue; }
  targets.push(render(`${name}.png`, Math.round(r.t)));
  console.log(`rendered ${name} @ ${(r.t / 1000).toFixed(1)}s (${r.label})`);
}

// ── v9 (report P0-1): full-film collision sweep — every 4s by default ───────
if (guard && !process.argv.includes('--no-sweep')) {
  const step = 4000;
  let swept = 0;
  const report = (t, vs) => {
    if (vs.length) {
      guardViolations += vs.length;
      // PANEL-10: v.id alone hid the check class; guard v2 reports
      // pill / fixed:<furniture> / edge with depth so the fix targets
      // the right band the first time.
      console.error(
        `  !! COLLISION GUARD — @${(t / 1000).toFixed(1)}s: ` +
          vs.map((v) => `${v.id}(${v.kind}, ${v.depth}px)`).join(', ')
      );
    }
  };
  for (let t = 0; t < tl.durationMs; t += step) {
    guard.resetGuard(`sweep@${(t / 1000).toFixed(1)}s`);
    drawFrame(ctx, tl, t, OPTS);
    report(t, guard.collectViolations());
    swept++;
  }
  // PANEL-10 (D-08/D-09 lesson): a 4s grid walks straight past the defects —
  // the fundSplit chip was plated only from ~40% into a 31s group, and the
  // title/watermark graze lived in the last 420ms of the group (the exit
  // lift). Every scene group's FINAL 1.2s is now swept at 120ms, plus its
  // mid-group worst camera (~70%), which is where hero moves peak. This is
  // the discipline the v9 "dense-sweep-verified" comments claimed; the tool
  // now actually does it.
  const dense = [];
  for (const b of tl.beats) {
    const dur = b.endMs - b.startMs;
    if (dur < 1600) continue;
    for (let t = Math.max(b.startMs, b.endMs - 1200); t < b.endMs; t += 120) dense.push(t);
    dense.push(b.startMs + dur * 0.7);
    dense.push(b.startMs + dur * 0.55);
  }
  for (const t of dense.sort((a, b2) => a - b2)) {
    guard.resetGuard(`dense@${(t / 1000).toFixed(1)}s`);
    drawFrame(ctx, tl, t, OPTS);
    report(t, guard.collectViolations());
    swept++;
  }
  console.log(
    `collision sweep: ${swept} frames (${Math.ceil(tl.durationMs / step)} grid + ${dense.length} dense exit/mid) — ${guardViolations ? 'VIOLATIONS FOUND' : 'clean'}`
  );
}

if (guardViolations) {
  console.error(`\n✗ COLLISION GUARD FAILED: ${guardViolations} violation(s) — fix the scene layout before rendering.`);
  process.exit(1);
}

console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${targets.length} frames in ${path.relative(REPO, OUT)}/`);
