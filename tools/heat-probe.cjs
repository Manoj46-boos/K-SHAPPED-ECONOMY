// End-to-end probe: does the datacenter frame carry heat particles?
const path = require('path');
const fs = require('fs');
const { createCanvas, registerFont } = require(path.join(__dirname, '..', 'node_modules', 'canvas'));
for (const [f, family, weight] of [
  ['Inter-400.ttf', 'Inter', 400], ['Inter-600.ttf', 'Inter', 600],
  ['Inter-700.ttf', 'Inter', 700], ['Fraunces-400.ttf', 'Fraunces', 400],
  ['Fraunces-600.ttf', 'Fraunces', 600], ['Fraunces-700.ttf', 'Fraunces', 700],
]) registerFont(path.join(__dirname, '..', 'public', 'fonts', f), { family, weight });

globalThis.document = { createElement: () => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };

const BUILD = path.join(__dirname, '..', '.render-check-build');
const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));
const { drawFrame } = require(path.join(BUILD, 'director.js'));
const { emitterKindFor } = require(path.join(BUILD, 'particles.js'));

function estWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = []; let t = 0;
  for (const w of words) {
    const d = Math.min(650, 180 + w.length * 38);
    out.push({ t: Math.round(t), d: Math.round(d), w }); t += d + 45;
  }
  return { words: out, durMs: Math.round(t) };
}
const manifest = { lines: {} };
SCRIPT.forEach((chapter, ci) => chapter.beats.forEach((beat, bi) =>
  splitSentences(beat.vo).forEach((text, si) => {
    const { words, durMs } = estWords(text);
    manifest.lines[`${ci}-${bi}-${si}`] = { key: `s-${ci}-${bi}-${si}`, durationMs: durMs, words };
  })));
const tl = buildTimeline(manifest, 30);
const b = tl.beats.find((x) => x.beat.scene.type === 'aiDatacenter');
console.log('aiDatacenter beat found:', !!b);
console.log('emitterKindFor(aiDatacenter):', emitterKindFor('aiDatacenter'));
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d');
drawFrame(ctx, tl, b.startMs + 2500, { captions: 'karaoke', channelName: 'x', progressBar: true });
fs.writeFileSync('/tmp/probe-heat-after.png', canvas.toBuffer('image/png'));
// count amber across the whole frame
const data = ctx.getImageData(0, 0, 1920, 1080).data;
let amber = 0;
for (let i = 0; i < data.length; i += 8) {
  const r = data[i], g = data[i + 1], bl = data[i + 2];
  if (r > 200 && g > 110 && g < 200 && bl < 95 && r - bl > 110) amber++;
}
console.log('amber pixels (half-sample):', amber);
