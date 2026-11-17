// PHASE 3 evidence probe — renders the exact motion windows the audit
// critiques: (a) a content-word strike +90ms (the arm-smear peak), (b) the
// last 150ms of a group whose exit rotation index maps to the NEW character
// exit (groupIdx % 4 === 3), (c) a mid-hold second for the hold-life read.
// Usage: node /home/z/my-project/scripts/probe-p3.mjs <outDir> <tag>
import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { registerFont } from 'canvas';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const REPO = '/home/z/my-project/repo/K-SHAPPED-ECONOMY';
const BUILD = path.join(REPO, '.render-check-build');
const outDir = process.argv[2] || '/home/z/my-project/work/p3probe';
const tag = process.argv[3] || 'probe';
mkdirSync(outDir, { recursive: true });

if (!existsSync(path.join(BUILD, 'director.js'))) {
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

const { accentFire, POSES } = require(path.join(BUILD, 'stickman.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));
const { drawFrame } = require(path.join(BUILD, 'director.js'));
const sd = require(path.join(BUILD, 'script-data.js'));

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
sd.SCRIPT.forEach((chapter, ci) => {
  chapter.beats.forEach((beat, bi) => {
    splitSentences(beat.vo).forEach((text, si) => {
      const { words, durMs } = estWords(text);
      manifest.lines[`${ci}-${bi}-${si}`] = { key: `s-${ci}-${bi}-${si}`, durationMs: durMs, words };
    });
  });
});
const tl = buildTimeline(manifest, 30);

const W = 1920, H = 1080;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingQuality = 'high';
const OPTS = {
  captions: 'karaoke', channelName: 'The Data Desk',
  nextVideoTitle: 'The 7 Companies That ARE the Market',
  watermark: true, progressBar: true,
};

// ── (a) a content-word strike +90ms inside a HOST scene (scenes-host draw) ──
// sentence words: {t (relative to sentence), d, w}; sentence.startMs is
// relative to the beat; beat.startMs is the wall clock.
let strike = null;
for (const b of tl.beats) {
  if (b.startMs < 30000) continue;
  for (const s of b.sentences || []) {
    for (const w of s.words || []) {
      if (w.w && accentFire(w.w)) {
        strike = { t: (s.startMs || b.startMs) + w.t + 90, word: w.w, beat: (b.beat.scene && b.beat.scene.sceneKey) || '' };
        break;
      }
    }
    if (strike) break;
  }
  if (strike) break;
}

// ── (b) a group whose index maps to the character exit (idx % 4 === 3) ──────
let exitPick = null;
tl.beats.forEach((b, i) => {
  const dur = b.endMs - b.startMs;
  if (((i % 4) + 4) % 4 === 3 && dur > 1400 && !exitPick && b.startMs > 30000) {
    exitPick = { t: b.endMs - 150, idx: i, beat: (b.beat.scene && b.beat.scene.sceneKey) || '', dur };
  }
});

// ── (c) a mid-hold second (the audit's hold-life example) ───────────────────
let hold = null;
for (const b of tl.beats) {
  const sk = (b.beat.scene && b.beat.scene.sceneKey) || '';
  if (sk.includes('statCards') || sk.includes('sitback')) {
    hold = { t: b.startMs + (b.endMs - b.startMs) * 0.6, beat: sk };
    break;
  }
}

const picks = [
  ['strike', strike], ['exit', exitPick], ['hold', hold],
].filter(([, p]) => p);

const report = [];
for (const [name, p] of picks) {
  drawFrame(ctx, tl, Math.round(p.t), OPTS);
  const f = `${outDir}/${tag}_${name}_${Math.round(p.t)}.png`;
  writeFileSync(f, canvas.toBuffer('image/png'));
  report.push(`${name}: t=${Math.round(p.t)}ms beat=${p.beat} ${p.word ? `word="${p.word}"` : ''}${p.idx !== undefined ? ` groupIdx=${p.idx}` : ''} -> ${f.split('/').pop()}`);
}
console.log(report.join('\n') || 'no probe windows found');
