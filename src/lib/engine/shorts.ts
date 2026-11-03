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
import { paintBg, PALETTE, rgba, roundRect, setFont } from './theme';
import { renderVideo } from './encode';
import { getSharedAudioContext } from './audio';

export interface ShortSpec {
  /** timeline ms where the short starts */
  startMs: number;
  /** duration of the short (ms) */
  durMs: number;
  /** headline shown in the top band */
  title: string;
  /** which 1080-wide slice of the 1920 design grid to crop: 0..0.44 (0.22 ≈ center) */
  cropX: number;
}

/** The six strongest vertical moments in the current script. */
export function pickShortMoments(tl: Timeline): ShortSpec[] {
  const byType = (t: string) => tl.beats.find((b) => b.beat.scene.type === t);
  const mk = (type: string, title: string, cropX = 0.22, lead = 300): ShortSpec | null => {
    const b = byType(type);
    if (!b) return null;
    return { startMs: b.startMs + lead, durMs: 50_000, title, cropX };
  };
  const list = [
    mk('divergeK', 'The K-shaped economy, in one shape', 0.2),
    mk('bigText', 'SEVEN stocks drive the market', 0.2),
    mk('statCards', 'The debt numbers, plainly', 0.1),
    mk('paradoxResolve', 'The “paradox” isn’t a paradox', 0.2),
    mk('oddsSpread', 'Nobody agrees on the recession odds', 0.15),
    mk('gasPump', 'Same gas price. Different worlds.', 0.15),
  ];
  return list.filter((x): x is ShortSpec => x !== null);
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

  // 2) scene frame with captions/watermark/progress suppressed — the crop
  //    is the scene's own composition, and we re-caption vertically below
  const octx = offscreen.getContext('2d')!;
  drawFrame(octx, tl, tMs, {
    ...opts,
    captions: 'off',
    progressBar: false,
    watermark: false,
  });

  // 3) crop the 1080×1080 window and place it in the middle band
  const sx = Math.round(Math.min(0.44, Math.max(0, spec.cropX)) * 1920);
  ctx.drawImage(offscreen, sx, 0, 1080, 1080, 0, 410, 1080, 1080);

  // 4) soft frame edge so the crop sits IN the phone, not slapped on it
  const edge = ctx.createLinearGradient(0, 410, 0, 410 + 90);
  edge.addColorStop(0, rgba('#FDFCF8', 0.55));
  edge.addColorStop(1, rgba('#FDFCF8', 0));
  ctx.fillStyle = edge;
  ctx.fillRect(0, 410, W, 90);

  // 5) top title band — 2 lines max, mobile-first, clear of the top UI
  ctx.save();
  setFont(ctx, 54, 700, 'Georgia, "Times New Roman", serif');
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
  //    raised baseY keeps the pill clear of the Shorts overlay zone
  drawCaptions(ctx, W, H, tMs, tl.captionLines, {
    mode: opts.captions,
    baseY: 1656,
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
