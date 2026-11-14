/**
 * render-evidence — renders the audit's BEFORE/AFTER evidence set with a
 * deterministic synthetic manifest (same clock as render-check.mjs), plus the
 * numeric probes the 100-judge report gates on:
 *   • head probe — topmost dark-ink y on editorial host beats (frame-edge rule)
 *   • hold strip — 8 consecutive frames of active speech + mean inter-frame diff
 *   • accent unit probe — poseAt forearm pulse on a CONTENT vs a FUNCTION word
 * Usage: node tools/render-evidence.mjs --out evidence/before [--rebuild] [--guard-demo]
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
const arg = (n, d = undefined) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);
const OUTDIR = path.join(REPO, arg('out', 'evidence/set'));
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
const { Stickman, launchPulse } = require(path.join(BUILD, 'stickman.js'));
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
SCRIPT.forEach((chapter, ci) => chapter.beats.forEach((beat, bi) => {
  splitSentences(beat.vo).forEach((text, si) => {
    const { words, durMs } = estWords(text);
    manifest.lines[`${ci}-${bi}-${si}`] = { key: `s-${ci}-${bi}-${si}`, durationMs: durMs, words };
  });
}));
const tl = buildTimeline(manifest, 30);
const OPTS = { captions: 'karaoke', channelName: 'The Data Desk', nextVideoTitle: 'x', watermark: true, progressBar: true };
const W = 1920, H = 1080;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

function render(name, tMs, useGuard = false) {
  if (useGuard && guard.resetGuard) {
    guard.collisionGuard.enabled = true;
    guard.resetGuard(name);
  }
  drawFrame(ctx, tl, Math.round(tMs), OPTS);
  if (useGuard && guard.collectViolations) {
    const vs = guard.collectViolations();
    if (vs.length) {
      console.log(`  [guard] ${name}: ${vs.length} violation(s) — ${vs.slice(0, 4).map(v => `${v.kind}:${v.id}@d${v.depth}`).join(', ')}${vs.length > 4 ? ` … (+${vs.length - 4})` : ''}`);
      // coral overlay boxes, same language as frame-dump --guard
      ctx.save();
      ctx.strokeStyle = 'rgba(240,90,70,0.95)';
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      for (const v of vs.slice(0, 6)) {
        ctx.strokeRect(v.rect.x, v.rect.y, v.rect.w, v.rect.h);
      }
      ctx.restore();
    } else {
      console.log(`  [guard] ${name}: clean`);
    }
  }
  const p = path.join(OUTDIR, name + '.png');
  fs.writeFileSync(p, canvas.toBuffer('image/png'));
  console.log('saved', name, '@', Math.round(tMs), 'ms');
  return p;
}

function topInkY(tMs) {
  drawFrame(ctx, tl, Math.round(tMs), OPTS);
  const d = ctx.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) {
    for (let x = 300; x < 1600; x += 2) {
      const i = (y * W + x) * 4;
      if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) return y;
    }
  }
  return H;
}

const hostBeats = tl.beats.filter((b) => b.beat.scene.type === 'host');
const fracAt = (b, f) => b.startMs + (b.endMs - b.startMs) * f;

console.log('== HEAD PROBE (gate: topmost ink >= 90px) ==');
hostBeats.slice(0, 4).forEach((b, i) => {
  console.log(`  host beat #${i} (ch${b.chapter + 1}) @50%: topmost ink y=${topInkY(fracAt(b, 0.5))}`);
});

// the editorial beat (nth 1) and the hold beat (nth 4) drive the frame set
const ed = hostBeats[1], hold = hostBeats[4];

console.log('== HOLD STRIP (alive-hold metric) ==');
const strip = [];
for (let i = 0; i < 8; i++) strip.push(fracAt(hold, 0.45) + i * 40);
let prev = null, diffs = [];
for (let i = 0; i < 8; i++) {
  drawFrame(ctx, tl, strip[i], OPTS);
  const d = ctx.getImageData(0, 0, W, H).data;
  if (prev) {
    let s = 0;
    for (let j = 0; j < d.length; j += 16) s += Math.abs(d[j] - prev[j]);
    diffs.push(s / (d.length / 16));
  }
  prev = d;
  if (i === 0 || i === 7) fs.writeFileSync(path.join(OUTDIR, `fix5_hold_g${i}.png`), canvas.toBuffer('image/png'));
}
console.log('  hold strip mean inter-frame diff:', (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2),
  diffs.map(v => v.toFixed(1)).join(' '));

console.log('== ACCENT UNIT PROBE (two-tier + stretch) ==');
// find the sentence active at the hold beat's 45% point, then probe a content
// word (>=3 chars) and a function word (<=2 chars) onset
const at45 = fracAt(hold, 0.45);
const sents = (hold.sentences || []).map((s) => ({ start: s.startMs, words: s.words }));
const sent = sents.find((s) => at45 >= s.start && at45 < s.start + 6000) || sents[0];
if (sent && sent.words.length) {
  const { hashStr } = require(path.join(BUILD, 'easing.js'));
  // pick the probe words by the SAME rule the accent tier uses: a KEY word
  // is >=3 chars AND hashes < 0.42; the function word is <=2 chars (always
  // the 12° whisper tier)
  const content = sent.words.find((w) => w.w.length >= 3 && hashStr(w.w.toLowerCase()) < 0.42)
    || sent.words.find((w) => w.w.length >= 3) || sent.words[0];
  const fn = sent.words.find((w) => w.w.length <= 2) || sent.words[sent.words.length - 1];
  const cOn = content.t + 60;  // same launch phase for both probes
  const fOn = fn.t + 60;
  // poseAt consumes (t, wordTimes) on ONE clock (the director passes the group
  // clock); the probe uses sentence-relative times for both — self-consistent.
  const po2 = (tRel) => Stickman.poseAt(tRel, {
    gesture: 'present', speaking: true, sentenceId: 'probe', prevSentenceId: 'probe',
    sentenceT: tRel, wordTimes: sent.words.map((w) => w.t),
    pointBias: 'right',
  });
  const pc = po2(cOn), pf = po2(fOn);
  const pw = { gesture: 'present', speaking: true, sentenceId: 'probe', prevSentenceId: 'probe', pointBias: 'right' };
  const wordTexts = sent.words.map((w) => w.w);
  const wordTimes = sent.words.map((w) => w.t);
  const pcW = Stickman.poseAt(cOn, { ...pw, sentenceT: cOn, wordTimes, words: wordTexts });
  const pfW = Stickman.poseAt(fOn, { ...pw, sentenceT: fOn, wordTimes, words: wordTexts });
  console.log(`  content word "${content.w}" @+60ms: rAL=${pc.rAL.toFixed(1)} stretch=${pc.stretch ?? 0}`);
  console.log(`  function word "${fn.w}" @+150ms: rAL=${pf.rAL.toFixed(1)} stretch=${pf.stretch ?? 0}`);
  console.log(`  [two-tier] KEY word "${content.w}" rAL=${pcW.rAL.toFixed(1)}  function word "${fn.w}" rAL=${pfW.rAL.toFixed(1)}  (Δ ≈ 44°·sinφ·(1−12/44) at the same phase)`);
  console.log(`  [launch stretch] launchPulse@key+60ms=${launchPulse(cOn, wordTimes).toFixed(2)}  @function+60ms=${launchPulse(fOn, wordTimes).toFixed(2)} (renderer elongates 1+0.06×this)`);
  // SentenceSeg.startMs is ABSOLUTE video ms — render on the film clock
  render('fix6_launch_content', sent.start + content.t + 60);
  render('fix6_accent_function', sent.start + fn.t + 60);
}

console.log('== FRAME SET ==');
render('fix1_editorial_headroom', fracAt(ed, 0.55), flag('guard'));
if (flag('guard-demo')) render('fix2_guard_demo', fracAt(ed, 0.55), true);
render('fix1_host_mid', fracAt(hostBeats[2], 0.5));
render('fix3_ownerworker', (() => {
  const b = tl.beats.filter((x) => x.beat.scene.type === 'ownerWorker')[0];
  return b.startMs + (b.endMs - b.startMs) * 0.75;
})());
render('fix3_goldtick', (() => {
  const b = tl.beats.filter((x) => x.beat.scene.type === 'chartTwin')[0];
  return b.startMs + (b.endMs - b.startMs) * 0.55;
})());
console.log('done ->', OUTDIR);
