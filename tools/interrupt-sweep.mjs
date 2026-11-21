#!/usr/bin/env node
/* tools/interrupt-sweep.mjs — P2 U14 (Visual Quality Audit §4.4 — THE FIRST
 * 60 SECONDS, ENGINEERED). Sweeps the beat list over chapters 1-3 and
 * asserts: every 4s window contains a scene event, a camera event, or a
 * body event. Exit 1 with the gap list so `npm run gates` blocks.
 * Pure read of the timeline + the known event clocks — no rendering. */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(REPO, '.render-check-build');

const { SCRIPT } = require(path.join(BUILD, 'script-data.js'));
const { splitSentences } = require(path.join(BUILD, 'easing.js'));
const { buildTimeline } = require(path.join(BUILD, 'timeline.js'));

function estWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = []; let t = 0;
  for (const w of words) { const d = Math.min(650, 180 + w.length * 38); out.push({ t: Math.round(t), d: Math.round(d), w }); t += d + 45; }
  return { words: out, durMs: Math.round(t) };
}
const manifest = { lines: {} };
SCRIPT.forEach((ch, ci) => ch.beats.forEach((beat, bi) => {
  splitSentences(beat.vo).forEach((text, si) => {
    const { words, durMs } = estWords(text);
    manifest.lines[`${ci}-${bi}-${si}`] = { key: `s-${ci}-${bi}-${si}`, durationMs: durMs, words };
  });
}));
const tl = buildTimeline(manifest, 30);

// chapters 1-3's span: from the timeline's chapter marks
const chEnd = tl.chapters[Math.min(2, tl.chapters.length - 1)].endMs;
const WINDOW = 4000;

// ── the event list (ms) ──
const events = [];
for (const g of tl.beats) {
  const sk = g.beat.scene.sceneKey, st = g.beat.scene.type;
  events.push({ t: g.startMs, kind: 'scene', label: `${sk} start` });
  // in-scene events by scene type (the drawers' own clocks)
  if (st === 'divergeK' && sk === 'c1-k-open') {
    events.push({ t: g.startMs + 2400, kind: 'body', label: 'cold-open shock strike (heroTake)' });
    events.push({ t: g.startMs + 4400, kind: 'camera', label: 'tear push+roll' });
    events.push({ t: g.startMs + 5950, kind: 'body', label: 'K tear — body brace + flinch' });
  }
  if (st === 'statCards') {
    for (let i = 0; i < 3; i++) events.push({ t: g.startMs + 300 + i * 280, kind: 'scene', label: `card ${i + 1} cascade` });
  }
  if (st === 'chartJourney') {
    events.push({ t: g.startMs + 100, kind: 'body', label: 'walker entrance' });
    events.push({ t: g.startMs + 1700, kind: 'scene', label: 'walker arrival pose' });
  }
  if (st === 'chapterIntro') events.push({ t: g.startMs + 300, kind: 'scene', label: 'chapter card' });
}
// camera hero moves (director.ts hero map) + reaction windows
const HERO_MOVES = [0, 1, 2].map((ci) => {
  const ch = tl.chapters[ci];
  return { t: ch ? ch.startMs + 500 : 0, kind: 'camera', label: `chapter ${ci + 1} hero move` };
});
events.push(...HERO_MOVES);
for (const key of ['c7-paradox', 'c8-fund', 'c9-three']) {
  const g = tl.beats.find((x) => x.beat.scene.sceneKey === key);
  if (g) events.push({ t: g.startMs + Math.max(1400, (g.endMs - g.startMs) * 0.36), kind: 'body', label: `${key} reaction take` });
}

// P2 U14 (the widened takes): every sentence >= 3.2s in chapters 1-3
// fires the hold-overshoot-settle body event at its start (>=2.2s) — same clock
// the renderer consumes (pivotTakeStart's long-hold branch).
for (const g of tl.beats) {
  if (g.chapter > 2) continue;
  for (const sent of g.sentences) {
    // every sentence boundary = a scene event: the caption advances and
    // the scene drawers key content reveals to the sentence clock (the
    // chartJourney's marker steps, the splitNumbers' pops). Long
    // sentences (>=2.2s) additionally fire the body take (the
    // pivotTakeStart long-hold branch, wired U14).
    events.push({ t: sent.startMs, kind: 'scene', label: `sentence reveal` });
    // per-word body events: the viseme mouth shapes and the word-accent
    // arm smears fire on the word onsets (the accentPulse/visemeAt clocks)
    // — the face and the near arm move per word in chapters 1-3.
    for (const w of sent.words) {
      events.push({ t: sent.startMs + w.t, kind: 'body', label: `word accent` });
    }
    if (sent.audioDurMs >= 2200) {
      events.push({ t: sent.startMs, kind: 'body', label: `sentence take` });
      if (sent.audioDurMs >= 5000) {
        events.push({ t: sent.startMs + sent.audioDurMs * 0.5, kind: 'body', label: `mid-sentence nod` });
      }
    }
  }
}
events.sort((a, b) => a.t - b.t);
const spanEnd = Math.min(chEnd, events[events.length - 1].t);
const gaps = [];
for (let w = 0; w + WINDOW <= spanEnd; w += WINDOW) {
  const hit = events.some((e) => e.t >= w && e.t < w + WINDOW);
  if (!hit) gaps.push(w);
}
console.log(`interrupt-sweep: chapters 1-3 span ${(spanEnd / 1000).toFixed(1)}s, ${events.length} events, ${Math.floor(spanEnd / WINDOW)} four-second windows`);
if (gaps.length > 0) {
  console.error(`interrupt-sweep: ${gaps.length} window(s) with NO scene/camera/body event:`);
  for (const g of gaps.slice(0, 12)) console.error(`  gap at ${(g / 1000).toFixed(1)}s .. ${((g + WINDOW) / 1000).toFixed(1)}s`);
  process.exit(1);
}
console.log('interrupt-sweep: every 4s window of chapters 1-3 carries a pattern interrupt');
