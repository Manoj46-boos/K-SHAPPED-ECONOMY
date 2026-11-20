/* Evidence strip — renders N frames of a chosen beat at chosen offsets and
 * tiles them into one PNG. Used by the P0-P4 BEFORE/AFTER evidence pass.
 *
 * Usage:
 *   node tools/strip.mjs --type divergeK --nth 0 --times 0,300,600,900 \
 *        --out /path/strip.png [--w 1920] [--h 1080] [--captions off]
 */
import path from 'node:path';
import fs from 'node:fs';
import { createCanvas, registerFont } from 'canvas';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BUILD = path.join(REPO, '.render-check-build');

for (const [f, family, weight] of [
  ['Inter-400.ttf', 'Inter', 400], ['Inter-600.ttf', 'Inter', 600], ['Inter-700.ttf', 'Inter', 700],
  ['Fraunces-400.ttf', 'Fraunces', 400], ['Fraunces-600.ttf', 'Fraunces', 600], ['Fraunces-700.ttf', 'Fraunces', 700],
]) registerFont(path.join(REPO, 'public', 'fonts', f), { family, weight: String(weight) });

globalThis.document = { createElement: () => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };

const { SCRIPT } = await import(path.join(BUILD, 'script-data.js'));
const { splitSentences } = await import(path.join(BUILD, 'easing.js'));
const { buildTimeline } = await import(path.join(BUILD, 'timeline.js'));
const { drawFrame } = await import(path.join(BUILD, 'director.js'));

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

function estWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  let out = [], t = 0;
  for (const w of words) {
    const d = Math.min(650, 180 + w.length * 38);
    out.push({ t: Math.round(t), d: Math.round(d), w });
    t += d + 45;
  }
  return { words: out, durMs: Math.round(t) };
}

const manifest = { lines: {} };
SCRIPT.forEach((ch, ci) => {
  ch.beats.forEach((b, bi) => {
    splitSentences(b.vo).forEach((text, si) => {
      const { words, durMs } = estWords(text);
      manifest.lines[`${ci}-${bi}-${si}`] = { key: `s-${ci}-${bi}-${si}`, durationMs: durMs, words };
    });
  });
});
const tl = buildTimeline(manifest, 30);

const type = arg('type', 'divergeK');
const nth = Number(arg('nth', 0));
const times = arg('times', '0,300,600').split(',').map(Number);
const W = Number(arg('w', 1920)), H = Number(arg('h', 1080));
const OUT = arg('out', '/tmp/strip.png');

const hits = tl.beats.filter((b) => b.beat.scene.type === type);
const b = hits[Math.min(nth, hits.length - 1)];
if (!b) { console.error('no beat of type', type); process.exit(1); }
console.log(`strip: ${type}#${nth} key=${b.beat.scene.sceneKey} start=${b.startMs} dur=${b.endMs - b.startMs}`);

const OPTS = {
  captions: arg('captions', 'off') === 'karaoke' ? 'karaoke' : 'off',
  channelName: 'The Data Desk',
  nextVideoTitle: 'x',
  watermark: false,
  progressBar: false,
};

const frames = [];
for (const off of times) {
  const t = b.startMs + off;
  const cc = createCanvas(W, H);
  const cctx = cc.getContext('2d');
  cctx.imageSmoothingQuality = 'high';
  drawFrame(cctx, tl, t, OPTS);
  frames.push(cc);
}
const COLS = Math.min(3, frames.length);
const ROWS = Math.ceil(frames.length / COLS);
const c = createCanvas(W * COLS, H * ROWS);
const cx = c.getContext('2d');
frames.forEach((f, i) => cx.drawImage(f, (i % COLS) * W, Math.floor(i / COLS) * H));
fs.writeFileSync(OUT, c.toBuffer('image/png'));
console.log('saved', OUT);
