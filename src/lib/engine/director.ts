/**
 * The Director — draws any frame of the video at time t.
 * Scene registry, scene-group persistence (beats sharing a sceneKey),
 * Ken Burns camera, chapter cards, captions, watermark, progress bar,
 * grain, vignette, and the global light fades.
 */

import { clamp01, easeInOutSine, easeOutCubic } from './easing';
import { PALETTE, paintBg, rgba } from './theme';
import { drawGrain, lightVignette, bokehField, scalePunch } from './effects';
import { drawCaptions, drawChapterCard, drawChapterLabel, drawProgressBar, drawWatermark } from './textfx';
import { Timeline, beatAt } from './timeline';
import { SceneCtx, SceneDrawer } from './scene-context';
import { hostScene, splitNumbersScene, divergeKScene, channelIntroScene, recapSplitScene, paradoxResolveScene } from './scenes-host';
import {
  chartTwinScene, chartJourneyScene, pieChartScene, dotGridScene, magChipsScene,
  barsCompareScene, trioConvergeScene, kDefScene, credibilityChipsScene, gasPumpScene,
  recessionGaugeScene, aiDatacenterScene, statCardsScene, ownerWorkerScene, fundSplitScene, oddsSpreadScene,
} from './scenes-data';
import {
  bigTextScene, stampCardScene, quoteCardScene, takeawaysScene, commentPromptScene, endScreenScene,
} from './scenes-text';

export const SCENES: Record<string, SceneDrawer> = {
  host: hostScene,
  splitNumbers: splitNumbersScene,
  divergeK: divergeKScene,
  channelIntro: channelIntroScene,
  chartTwin: chartTwinScene,
  chartJourney: chartJourneyScene,
  pieChart: pieChartScene,
  dotGrid: dotGridScene,
  magChips: magChipsScene,
  barsCompare: barsCompareScene,
  trioConverge: trioConvergeScene,
  kDef: kDefScene,
  credibilityChips: credibilityChipsScene,
  gasPump: gasPumpScene,
  recessionGauge: recessionGaugeScene,
  aiDatacenter: aiDatacenterScene,
  statCards: statCardsScene,
  ownerWorker: ownerWorkerScene,
  fundSplit: fundSplitScene,
  oddsSpread: oddsSpreadScene,
  bigText: bigTextScene,
  stampCard: stampCardScene,
  quoteCard: quoteCardScene,
  takeaways: takeawaysScene,
  commentPrompt: commentPromptScene,
  endScreen: endScreenScene,
  recapSplit: recapSplitScene,
  paradoxResolve: paradoxResolveScene,
};

export interface RenderOptions {
  captions: 'karaoke' | 'simple' | 'off';
  channelName: string;
  nextVideoTitle: string;
  watermark: boolean;
  progressBar: boolean;
}

interface Group {
  startMs: number;
  endMs: number;
  beatIdx: number; // index into timeline.beats
}

function computeGroups(tl: Timeline): Group[] {
  const groups: Group[] = [];
  let i = 0;
  while (i < tl.beats.length) {
    const start = i;
    const key = tl.beats[i].beat.scene.sceneKey;
    let end = i;
    while (end + 1 < tl.beats.length && tl.beats[end + 1].beat.scene.sceneKey === key) end++;
    groups.push({
      startMs: tl.beats[start].startMs,
      endMs: tl.beats[end].endMs,
      beatIdx: start,
    });
    i = end + 1;
  }
  return groups;
}

let cachedTimeline: Timeline | null = null;
let cachedGroups: Group[] = [];

function groupsFor(tl: Timeline): Group[] {
  if (cachedTimeline !== tl) {
    cachedGroups = computeGroups(tl);
    cachedTimeline = tl;
  }
  return cachedGroups;
}

function groupAt(tl: Timeline, tMs: number): Group | null {
  const gs = groupsFor(tl);
  let lo = 0;
  let hi = gs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const g = gs[mid];
    if (tMs < g.startMs) hi = mid - 1;
    else if (tMs >= g.endMs) lo = mid + 1;
    else return g;
  }
  return gs.length ? gs[Math.min(gs.length - 1, Math.max(0, lo))] : null;
}

/**
 * Camera v2 (PATCH 5). The v1 drift used `Math.sin(gt / 5200 + beatIndex *
 * 2.3)` — the drift direction flipped with beat-index parity, so
 * consecutive scenes wobbled in opposite directions like a bad handheld
 * shot. v2 derives intent from the scene itself: single-subject scenes push
 * in, comparison scenes pull back, and the drift is slow and always
 * screen-left-to-right — a camera operator, not a wobble.
 */
function cameraV2(
  ctx: CanvasRenderingContext2D,
  gt: number,
  groupDur: number,
  sceneType: string
): void {
  const p = clamp01(gt / Math.max(1, groupDur));
  // scenes that present a single subject push in; comparison scenes pull out
  const isComparison =
    sceneType.includes('split') || sceneType.includes('Compare') ||
    sceneType === 'ownerWorker' || sceneType === 'trioConverge';
  const target = isComparison ? -0.012 : 0.028; // pull back vs push in
  const camScale = 1 + target * easeInOutSine(p);
  // slow consistent drift, always screen-left-to-right (no beatIndex term)
  const camX = Math.sin(gt / 7300) * 6;
  const camY = Math.cos(gt / 9100) * 4;
  ctx.translate(960 + camX, 540 + camY);
  ctx.scale(camScale, camScale);
  ctx.translate(-960, -540);
}

/** Draw one complete frame of the video at absolute time tMs. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  tMs: number,
  opts: RenderOptions
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const t = clamp01(tMs / Math.max(1, tl.durationMs)) * tl.durationMs;
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  const beat = beatAt(tl, t);
  const group = groupAt(tl, t);
  if (!beat || !group) {
    ctx.restore();
    paintBg(ctx, W, H, t);
    return;
  }

  const gt = t - group.startMs;
  const groupDur = Math.max(1, group.endMs - group.startMs);
  const bt = t - beat.startMs;
  const beatDur = Math.max(1, beat.endMs - beat.startMs);

  // speaking state + word times (local to beat)
  const wordTimes: number[] = [];
  let speaking = false;
  for (const s of beat.sentences) {
    const sLocal = s.startMs - beat.startMs;
    if (t >= sLocal - 60 && t <= sLocal + s.audioDurMs + 200) speaking = true;
    for (const w of s.words) {
      const wt = sLocal + w.t;
      if (wt >= bt - 2000 && wt <= bt + 400) wordTimes.push(wt);
      if (wt > bt + 400) break;
    }
  }

  const g: SceneCtx = {
    ctx,
    W,
    H,
    beatT: bt,
    t: gt,
    d: groupDur,
    p: clamp01(gt / groupDur),
    beatP: clamp01(bt / beatDur),
    s: beat.beat.scene,
    beat: beat.beat,
    speaking,
    wordTimes,
    channelName: opts.channelName,
    nextVideoTitle: opts.nextVideoTitle,
  };

  // scale context for non-1080p targets (design grid is 1920×1080)
  const sx = W / 1920;
  const sy = H / 1080;
  ctx.save();
  ctx.scale(sx, sy);
  // camera v2: scene-aware push/pull + consistent drift (PATCH 5)
  cameraV2(ctx, gt, groupDur, beat.beat.scene.type);
  // 1-2% scale punch that decays over 160ms right after each hard cut
  const punch = scalePunch(gt);
  if (punch !== 1) {
    ctx.translate(960, 540);
    ctx.scale(punch, punch);
    ctx.translate(-960, -540);
  }

  const drawer = SCENES[beat.beat.scene.type] ?? hostScene;
  try {
    drawer(g);
  } catch {
    // never let one bad frame kill the render
    paintBg(ctx, 1920, 1080, gt);
  }
  ctx.restore();

  // chapter card overlay (before captions so captions stay readable on top)
  for (const cc of tl.chapterCards) {
    if (t >= cc.startMs && t < cc.endMs) {
      const cct = t - cc.startMs;
      const overall = clamp01(t / tl.durationMs);
      drawChapterCard(ctx, W, H, cct, cc.endMs - cc.startMs, cc.index + 1, cc.title, overall, tl.chapters.length);
    }
  }

  // chapter label (first seconds of each chapter, except during chapter card)
  const chIdx = tl.chapters.findIndex((c) => t >= c.startMs && t < c.endMs);
  if (chIdx >= 0) {
    const chT = t - tl.chapters[chIdx].startMs;
    const inCard = tl.chapterCards.some((c) => t >= c.startMs && t < c.endMs);
    if (!inCard && chT < 5000 && chIdx > 0) {
      drawChapterLabel(ctx, W, tl.chapters[chIdx].title, chT);
    }
  }

  // captions
  drawCaptions(ctx, W, H, t, tl.captionLines, { mode: opts.captions });

  // watermark
  if (opts.watermark) drawWatermark(ctx, W, opts.channelName);

  // progress bar + chapter ticks
  if (opts.progressBar) {
    const fracs = tl.chapters.slice(1).map((c) => c.startMs / tl.durationMs);
    drawProgressBar(ctx, W, H, t / tl.durationMs, fracs);
  }

  // grain + vignette
  drawGrain(ctx, W, H, 0.45);
  lightVignette(ctx, W, H, 0.8);

  // global fades: from white at start, to white at end
  const fadeIn = 1 - clamp01(t / 600);
  const fadeOut = clamp01((t - (tl.durationMs - 1100)) / 1100);
  const white = Math.max(fadeIn, fadeOut);
  if (white > 0.001) {
    ctx.fillStyle = rgba('#FDFCF8', white);
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** Draws a nice idle frame for the UI preview before timeline exists. */
export function drawIdleFrame(
  ctx: CanvasRenderingContext2D,
  tMs: number,
  channelName: string
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const sx = W / 1920;
  const sy = H / 1080;
  ctx.save();
  ctx.scale(sx, sy);
  paintBg(ctx, 1920, 1080, tMs);
  bokehField(ctx, 1920, 1080, tMs, { intensity: 1, seed: 5, gold: 0.55 });
  ctx.restore();
  // title
  ctx.save();
  ctx.scale(sx, sy);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `700 76px Georgia, serif`;
  ctx.fillText('The K-Shaped Economy', 960, 420);
  ctx.font = `600 40px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.fillText('market record highs · consumer confidence at 2022 lows', 960, 500);
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.font = `600 30px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(channelName.toUpperCase() + ' · VIDEO STUDIO', 960, 940);
  ctx.restore();
  void H;
  void W;
  void easeOutCubic;
}
