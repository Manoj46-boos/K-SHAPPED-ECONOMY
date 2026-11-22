/**
 * parity-check.mjs — C3 (market review): the CERTIFICATE OF QUALITY.
 * The engine's gates asserted motion and layout rules, but nothing tied the
 * thumbnail's face, the end card and the film face to ONE rendering path —
 * which is how the A8 identity split shipped. This gate asserts the parity:
 *
 *   1. PATH PARITY — thumbnail.js must render its figure through
 *      drawStickmanV2 (the film rig), not its own glyph code.
 *   2. PARAM PARITY — the thumbnail's face staging must equal the certified
 *      reaction staging exported by the film (THUMB_PARITY).
 *   3. RENDER PARITY — the thumbnail face crop and the film face crop must
 *      carry the same eye-channel structure: white-sclera share and ink
 *      share within tolerance (the A8 rebalance lives in BOTH renders).
 *
 * Usage: node tools/parity-check.mjs [--rebuild]
 * Exit 0 = certificate issued; exit 1 = parity broken.
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

if (!fs.existsSync(path.join(BUILD, 'director.js'))) {
  execSync('node tools/frame-dump.mjs --scene host --nth 0 --frac 0.5 --out /tmp/parity-warmup.png', { stdio: 'inherit', cwd: REPO });
}
for (const [f, family, weight] of [
  ['Inter-400.ttf', 'Inter', 400], ['Inter-600.ttf', 'Inter', 600], ['Inter-700.ttf', 'Inter', 700],
  ['Fraunces-400.ttf', 'Fraunces', 400], ['Fraunces-600.ttf', 'Fraunces', 600], ['Fraunces-700.ttf', 'Fraunces', 700],
]) {
  registerFont(path.join(REPO, 'public', 'fonts', f), { family, weight: String(weight) });
}
globalThis.document = { createElement: () => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };

const W = 1920, H = 1080;
let fails = 0;
const ok = (msg) => console.log(`  PASS  ${msg}`);
const bad = (msg) => { fails++; console.log(`  FAIL  ${msg}`); };

// ── 1. PATH PARITY ─────────────────────────────────────────────────────────────
const thumbSrc = fs.readFileSync(path.join(BUILD, 'thumbnail.js'), 'utf8');
if (thumbSrc.includes('drawStickmanV2')) ok('thumbnail renders through drawStickmanV2 (one face path)');
else bad('thumbnail draws its own face glyphs — identity split restored');

// ── 2. PARAM PARITY ────────────────────────────────────────────────────────────
const { THUMB_PARITY } = require(path.join(BUILD, 'thumbnail.js'));
const CERT = { faceScale: 1.8, talk: 0.68, jaw2x: 1.5 };
const same = CERT.faceScale === THUMB_PARITY?.faceScale
  && CERT.talk === THUMB_PARITY?.talk
  && CERT.jaw2x === THUMB_PARITY?.jaw2x;
if (same) ok(`thumbnail staging equals the certified gasp (faceScale ${THUMB_PARITY?.faceScale}, talk ${THUMB_PARITY?.talk}, jaw2x ${THUMB_PARITY?.jaw2x})`);
else bad(`thumbnail staging diverged: ${JSON.stringify(THUMB_PARITY)} vs certified ${JSON.stringify(CERT)}`);

// ── 3. RENDER PARITY ───────────────────────────────────────────────────────────
const { drawThumbnail } = require(path.join(BUILD, 'thumbnail.js'));
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
const OPTS = { captions: 'karaoke', channelName: 'The Data Desk', nextVideoTitle: 'The 7 Companies That ARE the Market', watermark: true, progressBar: true };

// film face: the host lead at the certified reaction register (rig 2.65 face 1.8 close-up family)
const film = createCanvas(W, H);
const fctx = film.getContext('2d');
fctx.imageSmoothingQuality = 'high';
const hostBeats = tl.beats.filter((b) => b.beat.scene.type === 'host');
const hb = hostBeats[0];
drawFrame(fctx, tl, hb.startMs + (hb.endMs - hb.startMs) * 0.55, OPTS);

// thumb face
const thumb = createCanvas(1280, 720);
const tctx = thumb.getContext('2d');
tctx.imageSmoothingQuality = 'high';
drawThumbnail(tctx, 1280, 720, 0);

// face crops: TIGHT head boxes — film host head ≈ (510,150) r 90 at this
// staging; thumb head ≈ (666,95) r 75 (SC 3.2 waist-up framing). The
// eye-channel metrics are ratios inside the face, scale-invariant.
const filmFace = film.getContext('2d').getImageData(400, 45, 230, 215);
const thumbFace = thumb.getContext('2d').getImageData(565, 45, 205, 185);

// the eye-channel metrics: sclera (near-white) share and ink (dark) share
function metrics(img) {
  let white = 0, ink = 0, total = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    total++;
    if (lum > 235) white++;
    if (lum < 60) ink++; // the ink line — excludes the thumb's deep-teal field (lum ≈ 86)
  }
  return { white: white / total, ink: ink / total };
}
const mf = metrics(filmFace), mt = metrics(thumbFace);
const tol = (a, b) => (a === 0 && b === 0) || Math.abs(a - b) / Math.max(a, b, 1e-6) <= 0.45;
if (tol(mf.white, mt.white)) ok(`sclera share parity: film ${(mf.white * 100).toFixed(1)}% vs thumb ${(mt.white * 100).toFixed(1)}%`);
else bad(`sclera share diverged: film ${(mf.white * 100).toFixed(1)}% vs thumb ${(mt.white * 100).toFixed(1)}% (the googly read is back)`);
if (tol(mf.ink, mt.ink)) ok(`ink share parity: film ${(mf.ink * 100).toFixed(1)}% vs thumb ${(mt.ink * 100).toFixed(1)}%`);
else bad(`ink share diverged: film ${(mf.ink * 100).toFixed(1)}% vs thumb ${(mt.ink * 100).toFixed(1)}%`);

console.log(fails === 0 ? '\nFACE-PARITY CERTIFICATE: ISSUED' : `\nFACE-PARITY CERTIFICATE: DENIED (${fails} failure(s))`);
process.exit(fails === 0 ? 0 : 1);