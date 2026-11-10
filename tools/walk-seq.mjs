import path from 'node:path';
import fs from 'node:fs';
import { createCanvas, registerFont } from 'canvas';

const REPO = '/home/z/my-project/repo';
const BUILD = path.join(REPO, '.render-check-build');

for (const [f, family, weight] of [
  ['Inter-400.ttf','Inter',400],['Inter-600.ttf','Inter',600],['Inter-700.ttf','Inter',700],
  ['Fraunces-400.ttf','Fraunces',400],['Fraunces-600.ttf','Fraunces',600],['Fraunces-700.ttf','Fraunces',700],
]) registerFont(path.join(REPO,'public','fonts',f), { family, weight: String(weight) });

globalThis.document = { createElement: () => createCanvas(192,192) };
globalThis.OffscreenCanvas = class { constructor(w,h){ return createCanvas(w,h); } };

const { SCRIPT } = await import(path.join(BUILD,'script-data.js'));
const { splitSentences } = await import(path.join(BUILD,'easing.js'));
const { buildTimeline } = await import(path.join(BUILD,'timeline.js'));
const { drawFrame } = await import(path.join(BUILD,'director.js'));

function estWords(text){
  const words = text.split(/\s+/).filter(Boolean);
  const out = []; let t = 0;
  for (const w of words){
    const d = Math.min(650, 180 + w.length * 38);
    out.push({ t: Math.round(t), d: Math.round(d), w });
    t += d + 45;
  }
  return { words: out, durMs: Math.round(t) };
}

const manifest = { lines: {} };
SCRIPT.forEach((ch,ci)=>{
  ch.beats.forEach((b,bi)=>{
    splitSentences(b.vo).forEach((text,si)=>{
      const { words, durMs } = estWords(text);
      manifest.lines[`${ci}-${bi}-${si}`] = { key:`s-${ci}-${bi}-${si}`, durationMs: durMs, words };
    });
  });
});
const tl = buildTimeline(manifest, 30);

let target = null;
for (const b of tl.beats){
  if (b.beat.scene.type === 'host' && b.beat.scene.entrance === 'walk'){ target = b; break; }
}
if (!target) target = tl.beats.find(b => b.beat.scene.type === 'host');
console.log('walk beat at', target.startMs, 'key', target.beat.scene.sceneKey, 'entrance', target.beat.scene.entrance);

const OPTS = { captions:'off', channelName:'The Data Desk', nextVideoTitle:'x', watermark:false, progressBar:false };
const W = 1920, H = 1080;

const frames = [];
const argN = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const N = argN('frames', 6);      // AUDIT-3: 6 frames matches the BEFORE sheet
const STEP = argN('step', 160);   // ms between frames
for (let i = 0; i < N; i++){
  const t = target.startMs + 80 + i * STEP;
  const cc = createCanvas(W,H);
  const cctx = cc.getContext('2d');
  cctx.imageSmoothingQuality = 'high';
  drawFrame(cctx, tl, t, OPTS);
  frames.push(cc);
}
const COLS = Math.min(3, N);
const ROWS = Math.ceil(N / COLS);
const c = createCanvas(W*COLS, H*ROWS);
const cx = c.getContext('2d');
for (let i = 0; i < N; i++) cx.drawImage(frames[i], (i%COLS)*W, Math.floor(i/COLS)*H);
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx >= 0 ? process.argv[outIdx + 1] : '/home/z/my-project/download/frames/walk-sequence.png';
fs.writeFileSync(OUT, c.toBuffer('image/png'));
console.log('saved', OUT);
