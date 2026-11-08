/**
 * The Director — draws any frame of the video at time t.
 * Scene registry, scene-group persistence (beats sharing a sceneKey),
 * Ken Burns camera, chapter cards, captions, watermark, progress bar,
 * grain, vignette, and the global light fades.
 */

import { clamp01, easeInOutSine, easeOutCubic } from './easing';
import { PALETTE, paintBg, rgba, FONT_DISPLAY, FONT_UI } from './theme';
import { drawGrain, lightVignette, bokehField, scalePunch, camState, kWipe } from './effects';
import { drawCaptions, drawChapterCard, drawChapterLabel, drawProgressBar, drawWatermark } from './textfx';
import { Timeline, beatAt } from './timeline';
import { SceneCtx, SceneDrawer } from './scene-context';
import { collisionGuard, resetGuard, setGuardOverlay, setGuardCamera, collectViolations } from './collision';
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

/** v8: the chapter color journey — a whisper tint rotation so a 20-minute
 *  film travels through color instead of one flat white. Market chapters
 *  lean teal, mood/hardship chapters lean coral, resolution chapters lean
 *  gold. Applied at 3-4% alpha in paintBg: lightness untouched, but the
 *  eye registers "new room" at every chapter card. */
const CHAPTER_TONES: Array<'up' | 'down' | 'gold' | 'neutral'> = [
  'neutral', // ch1 — the two numbers
  'up',      // ch2 — the market
  'down',    // ch3 — the mood
  'down',    // ch4 — same shock, different roads
  'up',      // ch5 — the AI engine
  'neutral', // ch6 — concentration
  'gold',    // ch7 — your portfolio (the twist)
  'up',      // ch8 — what to actually do
  'gold',    // ch9 — takeaways / end
];

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

/** PANEL-9 R5: scene drawers that threw during this render (deduped).
 *  Read by the studio after a render to list every silently-failed scene. */
export const sceneRenderErrors: { scene: string; message: string }[] = [];

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
 * P1-2 (report) — ONE hero camera move per chapter: the single amplified
 * gesture that anchors its chapter, on top of the always-on drift. Each is a
 * pure function of (gt, groupDur) — scrub-deterministic like everything
 * else — and each chapter's hero scene was picked from the actual script
 * structure. Amplitudes were chosen so bottom-zone content stays clear of
 * the caption pill under the guard's exact-camera mode (setGuardCamera):
 * pushes are capped (+0.035..0.04), trucks are horizontal-only (the pill's
 * y-band never moves).
 * PANEL-10: the LAST rise (ch7 fundSplit) is gone — a rise translates the
 * whole canvas, so it lifted the scene title into the fixed watermark band
 * (D-08) and the callback chip into the caption pill (D-09) in the same
 * breath. Lesson: rises are only safe on scenes with no furniture within
 * amt px of either band; every hero move is now truck or push/pullback,
 * and guard v2 (edge + fixed-furniture checks) sweeps all of them.
 */
const HERO_MOVES: Record<number, { scene: string; move: 'pullback' | 'push' | 'truck' | 'rise'; amt: number }> = {
  0: { scene: 'divergeK', move: 'pullback', amt: 0.055 },       // ch1 — the K reveals itself as the camera retreats
  1: { scene: 'chartJourney', move: 'truck', amt: 150 },        // ch2 — travel with the S&P timeline
  // ch3 — sentiment falls, the camera pans the other way (a negative-amt
  // truck). A rise was the poetic choice, but the dense 500ms guard sweep
  // caught the sourceTag lifting into the pill band at 230.5s: any UPWARD
  // move pulls bottom-zone content toward the caption pill, and the tag has
  // only ~40px of headroom. Horizontal-only moves can never collide.
  2: { scene: 'chartJourney', move: 'truck', amt: -150 },
  3: { scene: 'gasPump', move: 'truck', amt: 150 },             // ch4 — pan between the two households
  4: { scene: 'aiDatacenter', move: 'push', amt: 0.04 },        // ch5 — into the scale of the build-out
  5: { scene: 'paradoxResolve', move: 'pullback', amt: 0.05 },  // ch6 — the reveal breathes out
  // PANEL-10 (D-08/D-09): the ch7 'rise' lifted the scene title into the
  // fixed watermark band and the callback chip into the caption pill — a
  // rise moves the WHOLE canvas, so any scene with furniture near either
  // band can never be rise-safe. The twist now TRAVELS instead: a +110
  // truck (centered, ±55) pans from the fund box toward the host, and the
  // pill's y-band never moves (the host was re-anchored at W*0.84, so its
  // envelope clears the right edge under the full camera stack).
  6: { scene: 'fundSplit', move: 'truck', amt: 110 },           // ch7 — the twist travels
  7: { scene: 'takeaways', move: 'push', amt: 0.035 },          // ch8 — lean into the lesson
  8: { scene: 'endScreen', move: 'pullback', amt: 0.06 },       // ch9 — the wide farewell
};

/**
 * Camera v3 (v8 panel). v2 fixed the wobble and added parallax, but the
 * AMPLITUDE was below perception: 0.028 scale over a 6-8s scene is ~30px
 * of edge motion at 1080p — invisible next to a 40px caption. v3 nearly
 * doubles every value: single-subject scenes push 0.052, bigText dollies
 * 0.08, comparisons pull -0.026, drift runs 22/13px. Still slow, still
 * scene-intent-driven, still a pure function of (gt, groupDur) — but now
 * it FELT on a phone screen, which is where the audience actually is.
 * P1-2 (report) adds: the bigText ANTICIPATION pull-back (a 2.2% recoil
 * during the first 700ms that releases into the dolly — the wind-up every
 * slam needs), the per-chapter hero moves above, and the scene EXIT
 * envelope (content drifts up 30px and dissolves through light in the last
 * 420ms of every group — scenes used to cut off mid-life).
 */
function cameraV2(
  ctx: CanvasRenderingContext2D,
  gt: number,
  groupDur: number,
  sceneType: string,
  chapterIdx: number
): void {
  const p = clamp01(gt / Math.max(1, groupDur));
  // scenes that present a single subject push in; comparison scenes pull out
  const isComparison =
    sceneType.includes('split') || sceneType.includes('Compare') ||
    sceneType === 'ownerWorker' || sceneType === 'trioConverge';
  const target = sceneType === 'bigText' ? 0.08 : isComparison ? -0.026 : 0.052;
  let camScale = 1 + target * easeInOutSine(p);
  // P1-2: anticipation pull-back before bigText — recoil up to 3.2% during
  // the first 700ms, releasing straight into the 8% dolly (the panel's
  // still-audit graded 2.2% sub-threshold; 3.2% + the 8% push = an 11%
  // swing, which a single frame CAN show and a phone in motion FEELS)
  if (sceneType === 'bigText' && gt < 700) {
    camScale *= 1 - 0.032 * Math.sin((gt / 700) * Math.PI);
  }
  // slow consistent drift, always screen-left-to-right (no beatIndex term)
  let camX = Math.sin(gt / 7300) * 22;
  let camY = Math.cos(gt / 9100) * 13;
  if (sceneType === 'chartJourney') {
    const drawP = clamp01(gt / 2600);
    camX += (easeOutCubic(drawP) - 0.5) * 64;
  }
  // P1-2: the chapter's hero move — one amplified gesture per chapter
  const hero = HERO_MOVES[chapterIdx];
  if (hero && hero.scene === sceneType) {
    const e = easeInOutSine(p);
    if (hero.move === 'pullback') camScale -= hero.amt * e;
    else if (hero.move === 'push') camScale += hero.amt * e;
    else if (hero.move === 'truck') camX += hero.amt * (e - 0.5);
    else if (hero.move === 'rise') camY -= hero.amt * e;
  }
  // P1-2: scene EXIT — the last 420ms of a group lifts and recedes; the
  // paired enter-dissolve in drawFrame lands the next scene through light.
  // Short groups (< 1.4s) never exit-animate (no flicker on fast cuts).
  // Panel re-review: the first pass (30px, ease-in²) was invisible at the
  // mid-exit still; the lift now runs 34px with a ^1.5 ramp so motion is
  // present from the exit's first third, not only its last 2 frames.
  if (groupDur > 1400) {
    const exitP = clamp01((gt - (groupDur - 420)) / 420);
    if (exitP > 0) {
      const e = Math.pow(exitP, 1.5);
      camY -= 34 * e;
      camScale *= 1 - 0.015 * e;
    }
  }
  // publish BEFORE the scene draws — the bg planes counter-drift off this
  camState.dx = camX * camScale;
  camState.dy = camY * camScale;
  camState.scale = camScale;
  ctx.translate(960 + camX, 540 + camY);
  ctx.scale(camScale, camScale);
  ctx.translate(-960, -540);
}

/** P1-2 — per-chapter ENTRY styles: each chapter's first scene group opens
 *  with its own signature entrance (rotating family of four, all light-
 *  register: white/ivory washes, never dark). Drawn over the scene, under
 *  the captions, decaying inside 520ms. */
function chapterEntry(ctx: CanvasRenderingContext2D, W: number, H: number, gt: number, chapterIdx: number): void {
  const DUR = 520;
  if (gt < 0 || gt > DUR) return;
  const p = clamp01(gt / DUR);
  const fade = 1 - p;
  const style = chapterIdx % 4;
  ctx.save();
  if (style === 0) {
    // settle — a soft ivory veil thins out while the content settles down
    ctx.globalAlpha = 0.34 * fade;
    ctx.fillStyle = '#FFF9EE';
    ctx.fillRect(0, 0, W, H);
  } else if (style === 1) {
    // iris — a soft white ring retreats to the edges, opening the frame
    const k = 0.12 + 0.95 * easeOutCubic(p);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(Math.min(0.98, k), 'rgba(255,255,255,0)');
    g.addColorStop(1, `rgba(255,252,244,${0.5 * fade})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (style === 2) {
    // wipe — a warm slab slides off right, revealing the scene behind it
    const x = easeOutCubic(p) * W;
    ctx.globalAlpha = 0.42 * fade + 0.12;
    ctx.fillStyle = '#FFFCF4';
    ctx.fillRect(x, 0, W - x, H);
  } else {
    // K-wipe — the brand's own sweep opens the chapter (a lighter, faster
    // pass of the chapter-card transition)
    kWipe(ctx, W, H, gt * 1.6, DUR * 1.6);
    ctx.globalAlpha = 0.18 * fade;
    ctx.fillStyle = '#FFF9EE';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
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
  // v9 (report P0-1): per-frame collision-guard reset (no-op unless the
  // harness enabled it — zero cost in the studio render path)
  if (collisionGuard.enabled) resetGuard(`t=${Math.round(t)}ms`);

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
  // v8: this chapter's ambient tone rides the background wash
  const chapterTone = CHAPTER_TONES[Math.min(beat.chapter, CHAPTER_TONES.length - 1)];

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
  // P1-2: + chapter hero moves, bigText anticipation, scene exits
  cameraV2(ctx, gt, groupDur, beat.beat.scene.type, beat.chapter);
  // 1-2% scale punch that decays over 160ms right after each hard cut
  const punch = scalePunch(gt);
  if (punch !== 1) {
    ctx.translate(960, 540);
    ctx.scale(punch, punch);
    ctx.translate(-960, -540);
  }

  const drawer = SCENES[beat.beat.scene.type] ?? hostScene;
  try {
    g.chapterTone = chapterTone;
    drawer(g);
  } catch (err) {
    // PANEL-9 R5 (silent white frames): a throwing scene used to render a
    // blank background with NO trace — in a 35,049-frame render that is a
    // silent defect shipped to YouTube. The frame still renders (a bad
    // frame beats a dead render on an 8 GB laptop), but the failure is now
    // counted, logged once per scene, and surfaced to the studio UI via
    // __sceneRenderErrors so the render summary can list them.
    const sceneId = `ch${beat.chapter + 1}·${beat.beat.scene.type}@${(t / 1000).toFixed(1)}s`;
    if (!sceneRenderErrors.some((e) => e.scene === sceneId)) {
      const msg = err instanceof Error ? err.message : String(err);
      sceneRenderErrors.push({ scene: sceneId, message: msg });
      console.warn(`[director] scene render error (${sceneId}):`, msg);
    }
    paintBg(ctx, 1920, 1080, gt, chapterTone);
  }
  ctx.restore();

  // P1-2 (report): the exit/enter dissolves — every scene ENDS by lifting
  // into light (up to 50% ivory over the last 420ms, ^1.6 so motion reads
  // from the exit's first third — the panel's still-audit found the v1
  // square ramp invisible mid-exit) and every scene ARRIVES out of it
  // (decays over 240ms). Scenes used to cut off mid-life; now every cut is
  // a deliberate beat.
  {
    let white = 0;
    if (groupDur > 1400) {
      const exitP = clamp01((gt - (groupDur - 420)) / 420);
      white = Math.max(white, 0.5 * Math.pow(exitP, 1.6));
    }
    const enterP = clamp01(gt / 240);
    white = Math.max(white, 0.45 * (1 - enterP));
    if (white > 0.004) {
      ctx.save();
      ctx.globalAlpha = white;
      ctx.fillStyle = '#FFFCF4'; // warm ivory, never stark white
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  // P1-2 (report): per-chapter entry style on each chapter's FIRST group
  {
    const firstBeatOfChapter = tl.beats.find((b) => b.chapter === beat.chapter);
    if (firstBeatOfChapter && group.beatIdx === tl.beats.indexOf(firstBeatOfChapter)) {
      chapterEntry(ctx, W, H, gt, beat.chapter);
    }
  }
  // P1-2: publish the exact camera so the guard asserts against what the
  // pixels actually received (hero moves included)
  if (collisionGuard.enabled) setGuardCamera(camState.dx, camState.dy, camState.scale);

  // chapter card overlay (before captions so captions stay readable on top)
  for (const cc of tl.chapterCards) {
    if (t >= cc.startMs && t < cc.endMs) {
      // chapter cards intentionally cover the frame — the guard must not
      // read the covered scene content as a collision (P0-1)
      setGuardOverlay(true);
      const cct = t - cc.startMs;
      const overall = clamp01(t / tl.durationMs);
      // v8: the K-WIPE — the brand's own transition. A giant soft K sweeps
      // across the frame behind the card content for the first 420ms of
      // every chapter card: an owned piece of motion grammar that no
      // template video has. Cheap (one clipped drawK), deterministic.
      kWipe(ctx, W, H, cct);
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
  // v9 (report P0-2): host scenes draw a ONE-ROW pill (6-word window) — the
  // host figure lives in the lower third and a 2-row pill's top edge at
  // y≈796 used to plate his feet (defect D-02, now also prevented by the
  // raised host grounds and asserted by the collision guard).
  const isHostScene = beat.beat.scene.type === 'host';
  drawCaptions(ctx, W, H, t, tl.captionLines, {
    mode: opts.captions,
    maxRows: isHostScene ? 1 : 2,
    maxWords: isHostScene ? 6 : 8,
  });

  // watermark — PANEL-10 (guard v2): drawn BEFORE collectViolations so its
  // registerFixed() band is part of this frame's obstacle set (the old
  // order collected first, so the watermark could never be checked). The
  // watermark sits top-left; nothing else paints over it, so the reorder
  // has no visual effect.
  if (opts.watermark) drawWatermark(ctx, W, opts.channelName);

  // progress bar + chapter ticks
  if (opts.progressBar) {
    const fracs = tl.chapters.slice(1).map((c) => c.startMs / tl.durationMs);
    drawProgressBar(ctx, W, H, t / tl.durationMs, fracs);
  }

  // v9 (P0-1): stash this frame's violations for the harness to read
  // (pill + fixed furniture + frame edges — guard v2, PANEL-10)
  if (collisionGuard.enabled) collectViolations();

  // v8 finishing: grain 0.30 (film texture, not noise) and vignette
  // 0.45→0.30 — the vision panel flagged corner darkening on white as
  // "double-treating what the grain already does". Brighter corners,
  // cleaner white. Subtraction still reads premium.
  drawGrain(ctx, W, H, 0.30);
  lightVignette(ctx, W, H, 0.30);

  // global fades: from white at start, to white at end
  const fadeIn = 1 - clamp01(t / 600);
  const fadeOut = clamp01((t - (tl.durationMs - 1100)) / 1100);
  const white = Math.max(fadeIn, fadeOut);
  if (white > 0.001) {
    ctx.fillStyle = rgba('#FFFFFF', white);
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
  // v3: no camera on the idle frame — reset the parallax state so the
  // preview doesn't inherit a stale transform from the last drawFrame
  camState.dx = 0;
  camState.dy = 0;
  camState.scale = 1;
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
  ctx.font = `700 76px ${FONT_DISPLAY}`;
  ctx.fillText('The K-Shaped Economy', 960, 420);
  ctx.font = `600 40px ${FONT_UI}`;
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.fillText('market record highs · consumer confidence at 2022 lows', 960, 500);
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.font = `600 30px ${FONT_UI}`;
  ctx.fillText(channelName.toUpperCase() + ' · VIDEO STUDIO', 960, 940);
  ctx.restore();
  void H;
  void W;
  void easeOutCubic;
}
