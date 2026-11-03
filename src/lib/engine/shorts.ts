/**
 * Shorts pipeline — 9:16 vertical exports from the SAME engine (panel P2-1,
 * report §5.4). Same-niche Shorts raise long-form performance rather than
 * cannibalise it, and the engine already renders any frame at any time —
 * the vertical format is layout work, not new engineering.
 *
 * Composition (1080×1920, Shorts-safe):
 *   y  ~210–350   title band (2 lines max, mobile-first) + gold rule
 *   y  ~410–1490  a chosen 1080×1080 crop of the 1920×1080 scene
 *   y ~1540–1690  vertical karaoke captions (the EXISTING drawCaptions,
 *                 baseY raised clear of the YouTube overlay zone)
 *   y ~1730       channel mark
 *
 * Everything reuses the free, deterministic engine — renderVideo() with a
 * drawOverride. Each 60s Short renders in ~2–4 min on the 8 GB Dell.
 */

import { drawFrame, RenderOptions } from './director';
import { drawCaptions } from './textfx';
import { Timeline } from './timeline';
import { paintBg, PALETTE, rgba, roundRect, setFont, FONT_DISPLAY } from './theme';
import { renderVideo } from './encode';
import { getSharedAudioContext } from './audio';
import { clamp01 } from './easing';
import { bokehField, drawK3D, lightRays, sparkles } from './effects';
import { Stickman } from './stickman';
import { drawStickmanV2, talkAt } from './stickman-v2';

export interface ShortSpec {
  /** timeline ms where the short starts */
  startMs: number;
  /** duration of the short (ms) */
  durMs: number;
  /** headline shown in the top band */
  title: string;
  /** which 1080-wide slice of the 1920 design grid to crop: 0..0.44 (0.22 ≈ center) */
  cropX: number;
  /** v4 (audit P0-3 + P2-2): compose this moment NATIVELY in 9:16 instead of
   * cropping the 16:9 frame. 'k' = the diverge-K moment (host + labelled K
   * cannot fit any 1080 window); 'text' = hard-cut statement beats (the
   * 108px serif lines run ~1200px wide — no crop window can hold them). */
  native?: 'k' | 'text';
}

/** The six strongest vertical moments in the current script. */
export function pickShortMoments(tl: Timeline): ShortSpec[] {
  const byType = (t: string) => tl.beats.find((b) => b.beat.scene.type === t);
  const mk = (type: string, title: string, cropX = 0.22, lead = 300): ShortSpec | null => {
    const b = byType(type);
    if (!b) return null;
    return { startMs: b.startMs + lead, durMs: 50_000, title, cropX };
  };
  // v4 (audit P0-3): the flagship moment composes natively — no crop
  const kMoment = mk('divergeK', 'The K-shaped economy, in one shape');
  const txtMoment = mk('bigText', 'SEVEN stocks drive the market');
  const list = [
    kMoment ? { ...kMoment, native: 'k' as const } : null,
    txtMoment ? { ...txtMoment, native: 'text' as const } : null,
    // v4: statCards 0.1 → 0.045 — the old window started at x≈192, 82px INTO
    // the first card's text block; 0.045 shows cards 1–2 with card 1 fully
    // intact (text block ends x≈603)
    mk('statCards', 'The numbers, plainly', 0.045),
    mk('paradoxResolve', 'The “paradox” isn’t a paradox', 0.2),
    // v4: oddsSpread replaced by recessionGauge — the odds track spans
    // x≈220–1580 with a ~1190px centered closer line; no 1034px window can
    // hold it without mid-word truncation. The fixed gauge (x≈1181–1661,
    // source tag to x≈1810) fits whole inside a 0.42 window.
    mk('recessionGauge', 'Nobody agrees on the recession odds', 0.42),
    mk('gasPump', 'Same gas price. Different worlds.', 0.15),
  ];
  return list.filter((x): x is ShortSpec => x !== null);
}

/** The beat active at an absolute timeline time. */
function beatAt(tl: Timeline, tMs: number) {
  for (const b of tl.beats) {
    if (tMs >= b.startMs && tMs < b.endMs) return b;
  }
  return tl.beats.length ? tl.beats[tl.beats.length - 1] : undefined;
}

/** Scene type active at an absolute timeline time. */
function beatSceneTypeAt(tl: Timeline, tMs: number): string | undefined {
  return beatAt(tl, tMs)?.beat.scene.type;
}

/**
 * v4 (audit P0-3 + P2-2) — hard-cut statement beats, composed NATIVELY for
 * 9:16. The 16:9 scene sets these lines at 108px serif — ~1200px wide, wider
 * than any 1080 crop window, so the cropped Short truncated mid-word
 * (“OF FIVE HUNDRE…”). Here the lines auto-fit the vertical canvas with
 * the same Georgia/gold language, the underline sweep, sparkles and the
 * count-on-fingers host fully in frame.
 */
function drawNativeVerticalText(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  tMs: number
): void {
  bokehField(ctx, W, H, tMs, { intensity: 0.85, seed: 221, gold: 0.45 });
  lightRays(ctx, W, H, tMs, { alpha: 0.4 });

  const beat = beatAt(tl, tMs);
  const lines = ((beat?.beat.scene as any)?.lines as string[]) || [];
  const t = beat ? Math.max(0, tMs - beat.startMs) : tMs % 4000;
  const SERIF = FONT_DISPLAY; // v5 (audit P1-1): bundled Fraunces, not the Georgia lottery

  // auto-fit: the widest line must clear the 72px safe margins
  const maxTextW = W - 72 * 2;
  let size = 92;
  setFont(ctx, size, 700, SERIF);
  let widest = Math.max(1, ...lines.map((ln) => ctx.measureText(ln).width));
  if (widest > maxTextW) size = Math.max(46, Math.floor((size * maxTextW) / widest));

  const bandCy = 920;
  const step = size * 1.22;
  lines.forEach((ln, i) => {
    const ap = clamp01((t - 160 - i * 620) / 700);
    if (ap <= 0) return;
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.textAlign = 'center';
    const scale = 0.94 + 0.06 * (ap >= 1 ? 1 : ap);
    ctx.translate(W / 2, bandCy + (i - (lines.length - 1) / 2) * step + step / 2);
    ctx.scale(scale, scale);
    setFont(ctx, size, 700, SERIF);
    ctx.fillStyle = i === 1 ? PALETTE.goldDeep : PALETTE.ink;
    ctx.fillText(ln, 0, 0);
    ctx.restore();
  });

  // gold underline sweep under the statement block
  const up2 = clamp01((t - 1500) / 700);
  if (up2 > 0) {
    ctx.save();
    ctx.globalAlpha = up2;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    const w = 380 * up2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - w / 2, bandCy + ((lines.length - 1) / 2) * step + step);
    ctx.lineTo(W / 2 + w / 2, bandCy + ((lines.length - 1) / 2) * step + step);
    ctx.stroke();
    ctx.restore();
  }
  if (t > 1800) sparkles(ctx, W / 2, bandCy, tMs, t - 1800, { count: 10, radius: 240 });

  // host counting on fingers, fully in frame at bottom-left
  const hp = clamp01((t - 2200) / 600);
  if (hp > 0) {
    const pose = Stickman.poseAt(tMs, { gesture: 'count2', speaking: false });
    drawStickmanV2(ctx, 165, 1420, 0.92, tMs, { pose, alpha: hp, look: -0.6 }, 31);
  }
  void H;
}

/**
 * v4 (audit P0-3 + P2-2) — the diverge-K moment, composed NATIVELY for
 * 9:16 instead of cropped. Reuses the 16:9 scene's exact visual language
 * (growing teal/coral arms → 9-layer 3D K → arm labels → host) re-centred
 * for the phone: K at the band's optical centre, labels right-aligned hard
 * against a 72px safe margin, host fully in frame at bottom-left, nothing
 * amputated at any edge.
 */
function drawNativeVerticalK(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  tMs: number
): void {
  // atmosphere — same family as the 16:9 scene
  bokehField(ctx, W, H, tMs, { intensity: 1, seed: 21, gold: 0.6 });
  lightRays(ctx, W, H, tMs, { alpha: 0.5 });

  const kx = W * 0.5;
  const ky = 920; // optical centre of the 410–1490 band
  const S = 235;

  // beat-local time drives the same draw-on choreography as the 16:9 scene
  const beat = tl.beats.find((b) => tMs >= b.startMs && tMs < b.endMs);
  const t = beat ? Math.max(0, tMs - beat.startMs) : tMs % 4000;

  const growP = clamp01((t - 400) / 2300);
  const upP = clamp01((t - 400) / 1900);
  const dnP = clamp01((t - 1100) / 1900);

  ctx.save();
  ctx.lineCap = 'round';
  if (upP > 0) {
    ctx.strokeStyle = PALETTE.up;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(kx, ky + S * 0.1);
    ctx.lineTo(kx + S * 1.15 * upP, ky - S * 1.05 * upP);
    ctx.stroke();
    const g = ctx.createRadialGradient(kx + S * 1.15 * upP, ky - S * 1.05 * upP, 0,
      kx + S * 1.15 * upP, ky - S * 1.05 * upP, 42);
    g.addColorStop(0, rgba(PALETTE.up, 0.4));
    g.addColorStop(0.6, rgba(PALETTE.up, 0.14));
    g.addColorStop(1, rgba(PALETTE.up, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(kx + S * 1.15 * upP, ky - S * 1.05 * upP, 42, 0, Math.PI * 2);
    ctx.fill();
  }
  if (dnP > 0) {
    ctx.strokeStyle = PALETTE.down;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(kx, ky + S * 0.1);
    ctx.lineTo(kx + S * 1.15 * dnP, ky + S * 1.05 * dnP);
    ctx.stroke();
    const g = ctx.createRadialGradient(kx + S * 1.15 * dnP, ky + S * 1.05 * dnP, 0,
      kx + S * 1.15 * dnP, ky + S * 1.05 * dnP, 42);
    g.addColorStop(0, rgba(PALETTE.down, 0.4));
    g.addColorStop(0.6, rgba(PALETTE.down, 0.14));
    g.addColorStop(1, rgba(PALETTE.down, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(kx + S * 1.15 * dnP, ky + S * 1.05 * dnP, 42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // the full K fades in as the arms complete (the arms ARE the K)
  if (growP > 0.55) {
    const kA = clamp01((growP - 0.55) / 0.45);
    ctx.save();
    ctx.globalAlpha = kA;
    drawK3D(ctx, kx, ky, S, 1, tMs);
    ctx.restore();
    const dotA = clamp01((t - 2600) / 600);
    if (dotA > 0) {
      ctx.save();
      ctx.globalAlpha = dotA;
      ctx.fillStyle = PALETTE.up;
      ctx.beginPath();
      ctx.arc(kx + S * 0.9, ky - S * 0.82, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.down;
      ctx.beginPath();
      ctx.arc(kx + S * 0.9, ky + S * 0.82, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // arm labels — right-aligned hard against the safe margin so they can
  // never clip (the crop path cut “THE MARKET” at the window edge)
  const lblA = clamp01((t - 3000) / 700);
  if (lblA > 0) {
    ctx.save();
    ctx.globalAlpha = lblA;
    setFont(ctx, 30, 700);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.up;
    ctx.fillText('THE MARKET', W - 72, ky - S * 1.05 + 10);
    ctx.fillStyle = PALETTE.down;
    ctx.fillText('THE MOOD', W - 72, ky + S * 1.25);
    setFont(ctx, 40, 700, FONT_DISPLAY);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText('the K-shaped economy', kx, ky + S * 1.75);
    ctx.restore();
  }

  // host, fully in frame, bottom-left of the band — presenting the K
  const speaking = tl.voIntervals.some(
    (v) => tMs >= v.start - 150 && tMs <= v.end + 250
  );
  const pose = Stickman.poseAt(tMs, { gesture: 'present', speaking });
  let talk = 0;
  const line = tl.captionLines.find((l) => tMs >= l.start - 120 && tMs <= l.end + 260);
  if (line && speaking) {
    talk = talkAt(tMs - line.start, line.words.map((w) => w.t - line.start));
  }
  drawStickmanV2(ctx, 165, 1420, 0.95, tMs, { pose, alpha: clamp01(t / 400), look: 0.85, talk }, 5);
  void H;
}

/**
 * Draw one 1080×1920 vertical frame at FULL-timeline time tMs.
 * `offscreen` is a scratch 1920×1080 canvas (create once, reuse per frame).
 */
export function drawShortFrame(
  ctx: CanvasRenderingContext2D,          // 1080×1920 target
  offscreen: HTMLCanvasElement,           // 1920×1080 scratch
  tl: Timeline,
  spec: ShortSpec,
  tMs: number,
  opts: RenderOptions
): void {
  const W = 1080, H = 1920;

  // 1) full-bleed ivory backdrop on the vertical canvas
  paintBg(ctx, W, H, tMs);

  // 2) the hero band — native composition when this moment asks for it and
  //    the timeline is actually in that scene, otherwise the safe inset crop
  const activeType = beatSceneTypeAt(tl, tMs);
  if (spec.native === 'k' && activeType === 'divergeK') {
    drawNativeVerticalK(ctx, W, H, tl, tMs);
  } else if (spec.native === 'text' && activeType === 'bigText') {
    drawNativeVerticalText(ctx, W, H, tl, tMs);
  } else {
    // scene frame with captions/watermark/progress suppressed — the crop
    // is the scene's own composition, and we re-caption vertically below
    const octx = offscreen.getContext('2d')!;
    drawFrame(octx, tl, tMs, {
      ...opts,
      captions: 'off',
      progressBar: false,
      watermark: false,
    });

    // v4 (audit P0-3): the crop window is inset 46px so nothing important
    // rides the phone's screen edge — content that merely touches the old
    // 1080 boundary read as “cut off by the frame”, not composed
    const inset = 46;
    const sx = Math.round(Math.min(0.44, Math.max(0, spec.cropX)) * 1920);
    ctx.drawImage(
      offscreen,
      sx + inset * 0.5, 0, 1080 - inset, 1080,
      inset / 2, 410, 1080 - inset, 1080
    );

    // soft frame edge so the crop sits IN the phone, not slapped on it
    const edge = ctx.createLinearGradient(0, 410, 0, 410 + 90);
    edge.addColorStop(0, rgba('#FDFCF8', 0.55));
    edge.addColorStop(1, rgba('#FDFCF8', 0));
    ctx.fillStyle = edge;
    ctx.fillRect(0, 410, W, 90);

    // v4: soft SIDE edges too — some 16:9 scenes are wider than any 1034px
    // window (a scene title, a full-width track), so the window can cross
    // content. A 70px ivory taper on both sides makes any residual boundary
    // crossing read as intentional windowing/vignette, never a hard slice.
    // Peak 0.42 (not 0.55): enough to soften, light enough that the leftmost
    // tick label stays readable (panel note — protect edge labels from the
    // heaviest part of the fade).
    const fade = 70;
    const egL = ctx.createLinearGradient(inset / 2, 0, inset / 2 + fade, 0);
    egL.addColorStop(0, rgba('#FDFCF8', 0.42));
    egL.addColorStop(1, rgba('#FDFCF8', 0));
    ctx.fillStyle = egL;
    ctx.fillRect(inset / 2, 410, fade, 1080);
    const egR = ctx.createLinearGradient(W - inset / 2 - fade, 0, W - inset / 2, 0);
    egR.addColorStop(0, rgba('#FDFCF8', 0));
    egR.addColorStop(1, rgba('#FDFCF8', 0.42));
    ctx.fillStyle = egR;
    ctx.fillRect(W - inset / 2 - fade, 410, fade, 1080);
  }

  // 5) top title band — 2 lines max, mobile-first, clear of the top UI
  ctx.save();
  setFont(ctx, 54, 700, FONT_DISPLAY);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  // wrap to 2 rows of ~940px max
  const words = spec.title.split(' ');
  const rows: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > 940 && cur) {
      rows.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) rows.push(cur);
  rows.slice(0, 2).forEach((r, i) => ctx.fillText(r, W / 2, 250 + i * 66));
  ctx.fillStyle = PALETTE.gold;
  roundRect(ctx, W / 2 - 70, 250 + Math.min(rows.length, 2) * 66 - 10, 140, 8, 4);
  ctx.fill();
  ctx.restore();

  // 6) vertical captions — the existing system already scales by W/H; the
  //    raised baseY (v4, audit P0-3: 1656 → 1560) keeps the pill clear of
  //    the Shorts action bar AND the thumb zone
  drawCaptions(ctx, W, H, tMs, tl.captionLines, {
    mode: opts.captions,
    baseY: 1560,
  });

  // 7) channel mark bottom
  ctx.save();
  setFont(ctx, 26, 600);
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.textAlign = 'center';
  ctx.fillText(opts.channelName.toUpperCase(), W / 2, 1735);
  ctx.restore();
}

/**
 * Time-shift a timeline to a [startMs, startMs+durMs] window so renderVideo
 * (which renders frame 0..N) encodes the Short's span. With drawOverride set,
 * the shifted timeline only drives frame count + progress labels.
 */
export function shiftTimeline(
  tl: Timeline,
  startMs: number,
  durMs: number,
  fps: number
): Timeline {
  const shiftBeats = tl.beats
    .map((b) => ({
      ...b,
      startMs: b.startMs - startMs,
      endMs: b.endMs - startMs,
      sentences: b.sentences.map((s) => ({ ...s, startMs: s.startMs - startMs })),
    }))
    .filter((b) => b.endMs > 0);
  return {
    durationMs: durMs,
    fps,
    totalFrames: Math.max(1, Math.ceil((durMs / 1000) * fps)),
    beats: shiftBeats,
    chapterCards: tl.chapterCards
      .map((c) => ({ ...c, startMs: c.startMs - startMs, endMs: c.endMs - startMs }))
      .filter((c) => c.endMs > 0),
    chapters: tl.chapters.map((c) => ({
      ...c,
      startMs: c.startMs - startMs,
      endMs: c.endMs - startMs,
    })),
    captionLines: tl.captionLines
      .map((l) => ({
        ...l,
        start: l.start - startMs,
        end: l.end - startMs,
        words: l.words.map((w) => ({ ...w, t: w.t - startMs })),
      }))
      .filter((l) => l.end > 0),
    voIntervals: tl.voIntervals.map((v) => ({
      start: v.start - startMs,
      end: v.end - startMs,
    })),
    cutTimes: tl.cutTimes.map((c) => c - startMs).filter((c) => c >= 0),
    dataDingTimes: tl.dataDingTimes.map((d) => d - startMs).filter((d) => d >= 0),
  };
}

/** Slice an AudioBuffer to a window (Shorts encode only their own span). */
export function sliceAudioBuffer(
  src: AudioBuffer,
  startMs: number,
  durMs: number
): AudioBuffer {
  const ac = getSharedAudioContext();
  const sr = src.sampleRate;
  const startIdx = Math.max(0, Math.floor((startMs / 1000) * sr));
  const total = Math.max(
    1,
    Math.min(src.length - startIdx, Math.ceil((durMs / 1000) * sr))
  );
  const out = ac.createBuffer(2, total, sr);
  for (let ch = 0; ch < 2; ch++) {
    const s = src.getChannelData(Math.min(ch, src.numberOfChannels - 1));
    out.getChannelData(ch).set(s.subarray(startIdx, startIdx + total));
  }
  return out;
}

export interface ShortRenderJob {
  timeline: Timeline;
  mixBuffer: AudioBuffer;
  spec: ShortSpec;
  options: RenderOptions;
  /** a 1080×1920 canvas */
  canvas: HTMLCanvasElement;
  writable?: FileSystemWritableFileStream | null;
  onProgress?: (stats: {
    frame: number;
    totalFrames: number;
    fps: number;
    elapsedMs: number;
    etaMs: number;
    bytes: number;
  }) => void;
  onLog?: (msg: string) => void;
}

/** Render one Short as MP4 through the EXISTING encoder. */
export async function renderShort(job: ShortRenderJob): Promise<{ bytes: number }> {
  const { timeline: tl, mixBuffer, spec, options, canvas } = job;
  const fps = tl.fps;
  const durMs = Math.max(
    5_000,
    Math.min(spec.durMs, tl.durationMs - spec.startMs)
  );
  const off = document.createElement('canvas');
  off.width = 1920;
  off.height = 1080;

  return renderVideo({
    timeline: shiftTimeline(tl, spec.startMs, durMs, fps),
    mixBuffer: sliceAudioBuffer(mixBuffer, spec.startMs, durMs),
    canvas,
    options,
    writable: job.writable,
    onProgress: job.onProgress,
    onLog: job.onLog,
    drawOverride: (ctx, tMs) =>
      drawShortFrame(ctx, off, tl, spec, spec.startMs + tMs, options),
  });
}
