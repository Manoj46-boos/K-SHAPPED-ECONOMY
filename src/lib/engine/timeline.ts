/**
 * Timeline builder — turns the script + audio manifest into a frame-accurate
 * edit decision list: beats, chapter cards, caption lines, VO intervals.
 */

import { BeatSpec, ChapterSpec, SCRIPT } from './script-data';
import { CaptionLine } from './textfx';

export interface SentenceSeg {
  lineId: string;
  /** absolute ms in the final video */
  startMs: number;
  audioDurMs: number;
  /** word timings relative to sentence start (ms) */
  words: { t: number; d: number; w: string }[];
  text: string;
}

export interface TimelineBeat {
  chapter: number;
  chapterTitle: string;
  beatIndex: number;
  beat: BeatSpec;
  startMs: number;
  endMs: number;
  sentences: SentenceSeg[];
  /** local ms when speech is active */
  speakStartMs: number;
  speakEndMs: number;
}

export interface Timeline {
  durationMs: number;
  fps: number;
  totalFrames: number;
  beats: TimelineBeat[];
  chapterCards: { startMs: number; endMs: number; index: number; title: string; chapter: number }[];
  chapters: { index: number; title: string; startMs: number; endMs: number }[];
  captionLines: CaptionLine[];
  voIntervals: { start: number; end: number }[];
  /** v2 (PATCH 7/8): ms of every hard cut = start of each scene group.
   *  Used by the mixer to place whoosh transitions. */
  cutTimes: number[];
  /** v2 (PATCH 7/8): ms 1.4s after each data scene starts — when counters
   *  finish easing. Used by the mixer to place confirmation dings. */
  dataDingTimes: number[];
}

export interface AudioManifestEntry {
  key: string;
  durationMs: number;
  words: { t: number; d: number; w: string }[];
}

export interface AudioManifest {
  lines: Record<string, AudioManifestEntry>;
}

const SENTENCE_GAP = 110;
const BEAT_LEAD_IN = 70;
// v2 (PATCH 8): 1250ms hid the host while the next VO had already started —
// words with no face. 900ms + the built-in 380ms fade keeps the pace up and
// the presenter visible sooner.
const CHAPTER_CARD_DUR = 900;
const END_SCREEN_HOLD = 6500;

export function buildTimeline(manifest: AudioManifest, fps: number): Timeline {
  const beats: TimelineBeat[] = [];
  const chapterCards: Timeline['chapterCards'] = [];
  const captionLines: CaptionLine[] = [];
  const voIntervals: { start: number; end: number }[] = [];

  let now = 0;
  SCRIPT.forEach((chapter: ChapterSpec, ci: number) => {
    const startOfChapter = now;
    if (ci > 0) {
      chapterCards.push({
        startMs: now,
        endMs: now + CHAPTER_CARD_DUR,
        index: ci,
        title: chapter.title,
        chapter: ci,
      });
      now += CHAPTER_CARD_DUR;
    }
    chapter.beats.forEach((beat: BeatSpec, bi: number) => {
      const sentences: SentenceSeg[] = [];
      const chunks = beat.vo
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      void chunks;
      // sentence segmentation happens upstream (client sends per-sentence ids);
      // here we discover them from the manifest by beat-prefixed ids.
      const prefix = `${ci}-${bi}-`;
      const sentIdxs: number[] = [];
      let k = 0;
      while (manifest.lines[`${prefix}${k}`]) {
        sentIdxs.push(k);
        k++;
      }
      let local = BEAT_LEAD_IN;
      for (const si of sentIdxs) {
        const entry = manifest.lines[`${prefix}${si}`];
        sentences.push({
          lineId: `${prefix}${si}`,
          startMs: now + local,
          audioDurMs: entry.durationMs,
          words: entry.words,
          text: '',
        });
        local += entry.durationMs + SENTENCE_GAP;
      }
      const speakDur = Math.max(0, local - BEAT_LEAD_IN - SENTENCE_GAP);
      const pause = beat.pauseAfter ?? 350;
      const isEndScreen = beat.scene.type === 'endScreen';
      const beatDur = BEAT_LEAD_IN + speakDur + pause + (isEndScreen ? END_SCREEN_HOLD : 0);
      beats.push({
        chapter: ci,
        chapterTitle: chapter.title,
        beatIndex: bi,
        beat,
        startMs: now,
        endMs: now + beatDur,
        sentences,
        speakStartMs: BEAT_LEAD_IN,
        speakEndMs: BEAT_LEAD_IN + speakDur,
      });
      if (sentences.length) {
        voIntervals.push({ start: now + BEAT_LEAD_IN, end: now + BEAT_LEAD_IN + speakDur });
        for (const s of sentences) {
          captionLines.push({
            start: s.startMs,
            end: s.startMs + s.audioDurMs,
            words: s.words.map((w) => ({ t: s.startMs + w.t, d: w.d, w: w.w })),
          });
        }
      }
      now += beatDur;
    });
  });

  // chapter ranges
  const chapters = SCRIPT.map((c, ci) => {
    const first = beats.find((b) => b.chapter === ci)!;
    const lastBeats = beats.filter((b) => b.chapter === ci);
    const last = lastBeats[lastBeats.length - 1];
    return { index: ci, title: c.title, startMs: first.startMs, endMs: last.endMs };
  });

  const durationMs = Math.ceil(now + 400); // breathing room

  // ── v2 (PATCH 8): export hard-cut + data-moment times for the mixer ──
  // hard cuts = the start of every scene GROUP (consecutive beats sharing a
  // sceneKey are one continuous scene — no cut inside them)
  const cutTimes: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    const prevKey = i > 0 ? beats[i - 1].beat.scene.sceneKey : null;
    if (beats[i].beat.scene.sceneKey !== prevKey && beats[i].startMs > 0) {
      cutTimes.push(beats[i].startMs);
    }
  }
  // data moments = 1.4s after each counting scene starts (counters settle)
  const dataDingTimes: number[] = [];
  for (const b of beats) {
    if (['statCards', 'recessionGauge', 'barsCompare'].includes(b.beat.scene.type)) {
      dataDingTimes.push(b.startMs + 1400);
    }
  }

  return {
    durationMs,
    fps,
    totalFrames: Math.ceil((durationMs / 1000) * fps),
    beats,
    chapterCards,
    chapters,
    captionLines,
    voIntervals,
    cutTimes,
    dataDingTimes,
  };
}

/** Binary search for the beat covering time t (chapter cards overlay beats). */
export function beatAt(tl: Timeline, tMs: number): TimelineBeat | null {
  const beats = tl.beats;
  let lo = 0;
  let hi = beats.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = beats[mid];
    if (tMs < b.startMs) hi = mid - 1;
    else if (tMs >= b.endMs) lo = mid + 1;
    else return b;
  }
  return beats.length ? beats[Math.min(beats.length - 1, Math.max(0, lo))] : null;
}

export function chapterAt(tl: Timeline, tMs: number): number {
  let c = 0;
  for (const ch of tl.chapters) {
    if (tMs >= ch.startMs) c = ch.index;
  }
  return c;
}

/** Builds the YouTube chapter list from real rendered timings. */
export function youtubeChapters(tl: Timeline): string {
  return tl.chapters
    .map((c) => {
      const s = Math.floor(c.startMs / 1000);
      const m = Math.floor(s / 60);
      const sec = String(s % 60).padStart(2, '0');
      return `${m}:${sec} ${c.title.replace(/[""]/g, '"')}`;
    })
    .join('\n');
}
