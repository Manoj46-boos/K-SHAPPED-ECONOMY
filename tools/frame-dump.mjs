/**
 * Frame dump — render ONE evidence frame from the engine, for before/after
 * fix verification. Companion to render-check.mjs (same build, same fonts).
 *
 * Usage:
 *   node tools/frame-dump.mjs --scene magChips --nth 0 --frac 0.6 --out f.png
 *   node tools/frame-dump.mjs --at 176000 --out f.png
 *   node tools/frame-dump.mjs --thumb 0 --out t.png [--feed]
 *   node tools/frame-dump.mjs --short 1 --t 20000 --out s.png
 *   node tools/frame-dump.mjs --sweep 4000 --out-dir evidence/ [--guard]
 *
 * --guard: enable the collision guard, draw violation boxes in coral on the
 *          frame, and print the violation list (exit 1 if any).
 * --rebuild: force a fresh engine compile first.
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

// ── args ─────────────────────────────────────────────────────────────────────
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
  const list = files.filter((f) => fs.existsSync(f)); // collision/shorts may not exist yet
  execSync(
    ['node_modules/.bin/tsc', ...list,
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

const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));
const { drawFrame } = require(path.join(BUILD, 'director.js'));
// collision.ts may not exist yet in older checkouts — degrade gracefully
const guard = fs.existsSync(path.join(BUILD, 'collision.js'))
  ? require(path.join(BUILD, 'collision.js'))
  : { collisionGuard: { enabled: false }, resetGuard: () => {}, collectViolations: () => [] };

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

/** Render one frame; optionally with the collision guard live. */
function renderFrame(tMs, { guardOverlay = false } = {}) {
  if (guardOverlay) guard.collisionGuard.enabled = true;
  guard.collisionGuard.enabled && guard.resetGuard(`t=${Math.round(tMs)}ms`);
  drawFrame(ctx, tl, tMs, OPTS);
  if (guardOverlay) {
    const vs = guard.collectViolations();
    for (const v of vs) {
      ctx.save();
      ctx.strokeStyle = '#C2542E';
      ctx.lineWidth = 7;
      ctx.setLineDash([18, 12]);
      ctx.strokeRect(v.rect.x, v.rect.y, v.rect.w, v.rect.h);
      ctx.strokeRect(v.pill.x, v.pill.y, v.pill.w, v.pill.h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(194,84,46,0.92)';
      ctx.font = '700 30px Inter';
      ctx.textAlign = 'left';
      ctx.fillText(`⚠ ${v.id} ⚠ ${v.kind} overlap`, v.rect.x, Math.max(40, v.rect.y - 14));
      ctx.restore();
    }
    return vs;
  }
  return [];
}

function beatTime(type, nth = 0, frac = 0.55) {
  const hits = tl.beats.filter((b) => b.beat.scene.type === type);
  const b = hits[Math.min(nth, hits.length - 1)];
  if (!b) throw new Error(`no beat of type ${type}`);
  return b.startMs + (b.endMs - b.startMs) * frac;
}

function save(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, canvas.toBuffer('image/png'));
  console.log(`saved ${p}`);
}

// ── modes ────────────────────────────────────────────────────────────────────
if (flag('sweep')) {
  // collision-guard sweep across the whole film
  const step = Number(arg('sweep', 4000));
  const outDir = arg('out-dir', path.join(REPO, 'harness-frames'));
  guard.collisionGuard.enabled = true;
  const all = [];
  for (let t = 0; t < tl.durationMs; t += step) {
    guard.resetGuard(`sweep@${(t / 1000).toFixed(1)}s`);
    drawFrame(ctx, tl, t, OPTS);
    const vs = guard.collectViolations();
    if (vs.length) {
      all.push(...vs);
      console.log(`!! ${(t / 1000).toFixed(1)}s — ${vs.map((v) => v.id).join(', ')}`);
      if (flag('guard')) {
        // redraw with boxes for the first few violating frames
        ctx.clearRect(0, 0, W, H);
        const vs2 = renderFrame(t, { guardOverlay: true });
        save(path.join(outDir, `GUARD-violation-${Math.round(t / 1000)}s.png`));
        void vs2;
      }
    }
  }
  const uniq = [...new Set(all.map((v) => v.id))];
  console.log(`\nsweep done: ${all.length} violations across ${uniq.length} distinct elements`);
  if (all.length) {
    fs.writeFileSync(path.join(outDir, 'GUARD-violations.txt'),
      all.map((v) => `${v.frame} · ${v.id} · rect ${JSON.stringify(v.rect)} vs pill ${JSON.stringify(v.pill)} (depth ${v.depth}px)`).join('\n'));
    process.exit(1);
  }
} else if (flag('thumb')) {
  const { drawThumbnail } = require(path.join(BUILD, 'thumbnail.js'));
  const v = Number(arg('thumb', 0));
  const out = arg('out', `thumb-v${v}.png`);
  const c = createCanvas(1280, 720);
  drawThumbnail(c.getContext('2d'), 1280, 720, v);
  fs.writeFileSync(out, c.toBuffer('image/png'));
  console.log(`saved ${out}`);
  if (flag('feed')) {
    // 320px phone-feed simulation
    const f = createCanvas(320, 180);
    const fctx = f.getContext('2d');
    fctx.imageSmoothingQuality = 'high';
    fctx.drawImage(c, 0, 0, 320, 180);
    fs.writeFileSync(out.replace('.png', '-feed320.png'), f.toBuffer('image/png'));
    console.log(`saved ${out.replace('.png', '-feed320.png')}`);
  }
} else if (flag('short')) {
  const { drawShortFrame, pickShortMoments } = require(path.join(BUILD, 'shorts.js'));
  const idx = Number(arg('short', 0));
  const tOff = Number(arg('t', 12000));
  const shorts = pickShortMoments(tl);
  const spec = shorts[idx];
  if (!spec) throw new Error(`no short #${idx} (have ${shorts.length})`);
  const sc = createCanvas(1080, 1920);
  drawShortFrame(sc.getContext('2d'), canvas, tl, spec, spec.startMs + tOff, OPTS);
  fs.writeFileSync(arg('out', `short-${idx}.png`), sc.toBuffer('image/png'));
  console.log(`saved ${arg('out', `short-${idx}.png`)} (short ${idx} @ +${tOff}ms, native=${spec.native})`);
} else {
  const t = flag('at') ? Number(arg('at')) : beatTime(arg('scene', 'host'), Number(arg('nth', 0)), Number(arg('frac', 0.55)));
  const vs = renderFrame(t, { guardOverlay: flag('guard') });
  save(arg('out', 'frame.png'));
  if (flag('guard')) {
    if (vs.length) { console.log(`guard: ${vs.length} violations`); process.exit(1); }
    console.log('guard: clean');
  }
}
console.log(`(timeline: ${(tl.durationMs / 60000).toFixed(1)} min)`);
