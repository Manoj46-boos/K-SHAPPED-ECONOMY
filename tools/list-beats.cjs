/** List every beat: index, type, sceneKey, start-end ms — for picking
 *  deterministic frame-dump times. QA helper, Phase 0 evidence pass. */
const path = require('node:path');
const { createRequire } = require('node:module');
const { fileURLToPath } = require('node:url');
const REPO = path.resolve(__dirname, '..');
const BUILD = path.join(REPO, '.render-check-build');
const require2 = createRequire(path.join(REPO, 'tools', 'frame-dump.mjs'));
const { SCRIPT } = require2(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require2(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require2(path.join(BUILD, 'timeline.js'));

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
const wanted = process.argv.slice(2);
tl.beats.forEach((b) => {
  const type = b.beat.scene.type;
  const key = b.beat.scene.sceneKey || '';
  if (wanted.length && !wanted.some((w) => type === w || key.includes(w))) return;
  console.log(
    `${type.padEnd(14)} ${String(key).padEnd(12)} ` +
    `${Math.round(b.startMs / 100) / 10}s .. ${Math.round(b.endMs / 100) / 10}s ` +
    `(mid ${Math.round((b.startMs + b.endMs) / 200) / 10}s)`
  );
});
console.log(`total ${tl.beats.length} beats`);
