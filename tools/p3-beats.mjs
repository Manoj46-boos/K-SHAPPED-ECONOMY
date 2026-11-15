/**
 * p3_beats — print the beats Phase 3 evidence needs (synthetic clock,
 * same manifest model frame-dump.mjs uses). Read-only probe.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas, registerFont } from 'canvas';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(REPO, '.render-check-build');

for (const [f, family, weight] of [
  ['Inter-400.ttf', 'Inter', 400], ['Inter-600.ttf', 'Inter', 600], ['Inter-700.ttf', 'Inter', 700],
  ['Fraunces-400.ttf', 'Fraunces', 400], ['Fraunces-600.ttf', 'Fraunces', 600], ['Fraunces-700.ttf', 'Fraunces', 700],
]) registerFont(path.join(REPO, 'public', 'fonts', f), { family, weight: String(weight) });
globalThis.document = { createElement: () => createCanvas(192, 192) };
globalThis.OffscreenCanvas = class { constructor(w, h) { return createCanvas(w, h); } };

const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));

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

const WANT = new Set(['c3-twin', 'c3-ndq', 'c4-gallup', 'c5-gauge', 'c1-k-open', 'c1-k', 'c2-kdef', 'c8-kdef', 'kdef']);
console.log('idx  chapter  startMs   endMs    dur    sceneKey        type            phase');
tl.beats.forEach((b, i) => {
  const sk = b.beat.scene.sceneKey || '-';
  const ph = (b.beat.scene.phase || '') || '';
  if (WANT.has(sk) || ['chartJourney', 'chartTwin', 'statCards', 'recessionGauge', 'divergeK', 'kDef'].includes(b.beat.scene.type)) {
    console.log(
      String(i).padStart(3),
      String(b.chapter).padStart(5),
      String(b.startMs).padStart(8),
      String(b.endMs).padStart(8),
      String(b.endMs - b.startMs).padStart(6),
      sk.padEnd(15),
      b.beat.scene.type.padEnd(15),
      ph
    );
  }
});
// statCards card counts + annotations counts for the mixer math
for (const b of tl.beats) {
  const sc = b.beat.scene;
  if (sc.type === 'statCards') {
    console.log(`statCards @${b.startMs} cards=${((sc.cards) || []).length} bignum=${((sc.cards || []).map(c => c.big)).join('|')}`);
  }
  if (sc.type === 'chartJourney' && ((sc.annotations) || []).length) {
    console.log(`chartJourney @${b.startMs} key=${sc.sceneKey} annotations=${sc.annotations.map(a => a.at).join(',')} phase=${sc.phase || ''}`);
  }
  if (sc.type === 'chartTwin') {
    console.log(`chartTwin @${b.startMs} charts=${((sc.charts) || []).length}`);
  }
}
console.log(`duration ${tl.durationMs}`);
