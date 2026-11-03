/**
 * Shorts pipeline — 9:16 vertical exports from the SAME engine (panel P2-2,
 * audit §7). Same-niche Shorts raise long-form performance rather than
 * cannibalise it, and the engine already renders any frame at any time —
 * the vertical format is layout work, not new engineering.
 *
 * v6 (audit P2-2) — the six strongest beats now compose NATIVELY in 9:16.
 * The v4/v5 crop path survives only as a fallback for spans that fall
 * outside the six native moments. One layout grammar across all six, so
 * the channel's Shorts read as a system, not six one-offs:
 *
 *   y  ~210–350   title band (2 lines max, mobile-first) + gold rule
 *   y  ~380–1080  hero visual, composed FOR the phone, optical centre 730
 *   y ~1116–1264  karaoke caption pill — centre ≈ 62% of frame height,
 *                 the swipe-through sweet spot, clear of the Shorts UI
 *   y ~1320–1700  presenter zone (bottom-left, clear of the action rail)
 *   y ~1730       channel mark
 *
 * Everything reuses the free, deterministic engine — renderVideo() with a
 * drawOverride. Each 60s Short renders in ~2–4 min on the 8 GB Dell.
 */

import { drawFrame, RenderOptions } from './director';
import { drawCaptions } from './textfx';
import { Timeline } from './timeline';
import { paintBg, PALETTE, TONE, card, rgba, roundRect, setFont, FONT_DISPLAY, FONT_UI } from './theme';
import { renderVideo } from './encode';
import { getSharedAudioContext } from './audio';
import { clamp01, easeOutCubic } from './easing';
import { bokehField, drawK3D, lightRays, sparkles, floatCoins } from './effects';
import { Stickman } from './stickman';
import { drawStickmanV2, talkAt } from './stickman-v2';
import { gauge } from './charts';

/** v6 (audit P2-2): every strong moment composes natively — no crop. */
export type NativeMode = 'k' | 'text' | 'stats' | 'paradox' | 'gauge' | 'pump';

export interface ShortSpec {
  /** timeline ms where the short starts */
  startMs: number;
  /** duration of the short (ms) */
  durMs: number;
  /** headline shown in the top band */
  title: string;
  /** which 1080-wide slice of the 1920 design grid to crop: 0..0.44 (0.22 ≈ center).
   *  Fallback only — v6 renders the six strongest beats natively. */
  cropX: number;
  /** compose this moment NATIVELY in 9:16 instead of cropping the 16:9 frame */
  native?: NativeMode;
}

/** The six strongest vertical moments in the current script — all native. */
export function pickShortMoments(tl: Timeline): ShortSpec[] {
  const byType = (t: string) => tl.beats.find((b) => b.beat.scene.type === t);
  const mk = (
    type: string,
    title: string,
    native: NativeMode,
    cropX = 0.22,
    lead = 300
  ): ShortSpec | null => {
    const b = byType(type);
    if (!b) return null;
    return { startMs: b.startMs + lead, durMs: 50_000, title, cropX, native };
  };
  const list = [
    // the signature moment: the K draws itself, host presenting
    mk('divergeK', 'The K-shaped economy, in one shape', 'k'),
    // hard-cut statement beats — 108px serif lines cannot survive any crop
    mk('bigText', 'SEVEN stocks drive the market', 'text', 0.24),
    // the margin wall: 13.4% / $4.42T / 12.4% stacked full-width
    mk('statCards', 'The numbers, plainly', 'stats', 0.045),
    // PARADOX struck through, resolves into the K
    mk('paradoxResolve', 'The “paradox” isn’t a paradox', 'paradox', 0.2),
    // the 48% coin-flip gauge with both camps' quotes
    mk('recessionGauge', 'Nobody agrees on the recession odds', 'gauge', 0.42),
    // same pump, two households, two roads
    mk('gasPump', 'Same gas price. Different worlds.', 'pump', 0.15),
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

/** Scene props of the beat active at tMs. */
function scenePropsAt(tl: Timeline, tMs: number): Record<string, any> {
  return (beatAt(tl, tMs)?.beat.scene as Record<string, any>) || {};
}

// ── the v6 native layout grammar (audit P2-2) ────────────────────────────────

/** Caption pill bottom edge: centre lands ≈ 62% of 1920 = 1190. */
const CAPTION_BASE_NATIVE = 1260;
/** Presenter ground line in the bottom-left presenter zone. */
const HOST_GROUND = 1450;

/** v6: the host, bottom-left of the presenter zone, clear of the pill/rail. */
function drawShortHost(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  tMs: number,
  gesture: string,
  alpha: number,
  look: number,
  seed: number
): void {
  if (alpha <= 0) return;
  const speaking = tl.voIntervals.some((v) => tMs >= v.start - 150 && tMs <= v.end + 250);
  const pose = Stickman.poseAt(tMs, { gesture, speaking });
  let talk = 0;
  const line = tl.captionLines.find((l) => tMs >= l.start - 120 && tMs <= l.end + 260);
  if (line && speaking) {
    talk = talkAt(tMs - line.start, line.words.map((w) => w.t - line.start));
  }
  drawStickmanV2(ctx, 165, HOST_GROUND, 0.9, tMs, { pose, alpha, look, talk }, seed);
}

/** Small centered source credit above the channel mark (data scenes). */
function drawShortSource(ctx: CanvasRenderingContext2D, source: string | undefined): void {
  if (!source) return;
  ctx.save();
  setFont(ctx, 24, 400, FONT_UI);
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.textAlign = 'center';
  ctx.fillText(`Source: ${source}`, 540, 1690);
  ctx.restore();
}

/**
 * v6 (audit P2-2) — hard-cut statement beats, composed NATIVELY for 9:16.
 * The 16:9 scene sets these lines at 108px serif — ~1200px wide, wider than
 * any 1080 crop window, so the cropped Short truncated mid-word. Here the
 * lines auto-fit the vertical canvas with the same Fraunces/gold language,
 * the underline sweep, sparkles and the host fully in frame.
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
  const SERIF = FONT_DISPLAY; // v5 (audit P1-1): bundled Fraunces

  // auto-fit: the widest line must clear the 72px safe margins
  const maxTextW = W - 72 * 2;
  let size = 92;
  setFont(ctx, size, 700, SERIF);
  let widest = Math.max(1, ...lines.map((ln) => ctx.measureText(ln).width));
  if (widest > maxTextW) size = Math.max(46, Math.floor((size * maxTextW) / widest));

  const bandCy = 700; // optical centre of the v6 hero zone
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

  // host counting on fingers, in the presenter zone
  const hp = clamp01((t - 2200) / 600);
  if (hp > 0) drawShortHost(ctx, tl, tMs, 'count2', hp, -0.6, 31);
}

/**
 * v6 (audit P2-2) — the diverge-K moment, composed NATIVELY for 9:16.
 * Reuses the 16:9 scene's exact visual language (growing teal/coral arms →
 * 9-layer 3D K → arm labels → host) re-centred for the phone: K at the
 * hero zone's optical centre, labels right-aligned hard against a 72px safe
 * margin, host in the presenter zone, nothing amputated at any edge.
 */
function drawNativeVerticalK(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  tMs: number
): void {
  bokehField(ctx, W, H, tMs, { intensity: 1, seed: 21, gold: 0.6 });
  lightRays(ctx, W, H, tMs, { alpha: 0.5 });

  const kx = W * 0.5;
  const ky = 730; // optical centre of the v6 hero zone (380–1080)
  const S = 210;

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
    ctx.fillText('the K-shaped economy', kx, ky + S * 1.6);
    ctx.restore();
  }

  // host presenting, in the presenter zone below the captions
  drawShortHost(ctx, tl, tMs, 'present', clamp01(t / 400), 0.85, 5);
}

/**
 * v6 (audit P2-2) — the margin wall (statCards), composed NATIVELY for
 * 9:16. The 16:9 scene lays three cards in a 1700px row — no crop window
 * can hold even two. Here the three cards stack full-width with big-serif
 * numerals sized for a phone screen, tone accent bars, tag chips, and the
 * same card()/TONE design language as the long-form video.
 */
function drawNativeVerticalStats(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  tMs: number
): void {
  bokehField(ctx, W, H, tMs, { intensity: 0.9, seed: 61, gold: 0.45 });
  lightRays(ctx, W, H, tMs, { alpha: 0.4 });

  const beat = beatAt(tl, tMs);
  const t = beat ? Math.max(0, tMs - beat.startMs) : tMs % 4000;
  const s = scenePropsAt(tl, tMs);
  const cards = ((s.cards as any[]) || []).slice(0, 3);

  const x = 84;
  const w = W - 84 * 2; // 912
  const h = 210;
  cards.forEach((c, i) => {
    const p = clamp01((t - 600 - i * 800) / 900);
    if (p <= 0) return;
    const y = 380 + i * 232;
    const tone = TONE(c.tone || 'up');
    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 1.6);
    ctx.translate(0, (1 - easeOutCubic(p)) * 26);
    card(ctx, x, y, w, h, { r: 26 });
    // tone accent bar
    ctx.fillStyle = tone.main;
    roundRect(ctx, x + 34, y + 26, 64 * p, 7, 3.5);
    ctx.fill();
    // big numeral — display serif, phone-legible
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    setFont(ctx, 84, 700, FONT_DISPLAY);
    ctx.fillStyle = tone.main;
    ctx.fillText(String(c.big), x + 40, y + 118);
    // tag chip, top-right, clear of the numeral
    if (c.tag) {
      setFont(ctx, 22, 600, FONT_UI);
      const tw = ctx.measureText(c.tag).width;
      const tagX = x + w - 40 - tw - 28;
      if (tagX > x + 260) {
        ctx.fillStyle = tone.soft;
        roundRect(ctx, tagX, y + 28, tw + 28, 36, 18);
        ctx.fill();
        ctx.fillStyle = tone.main;
        ctx.fillText(c.tag, tagX + 14, y + 52);
      }
    }
    // label, up to two wrap lines
    setFont(ctx, 26, 600, FONT_UI);
    ctx.fillStyle = PALETTE.inkSoft;
    let line = '';
    const words = String(c.label).split(' ');
    let ly = y + 158;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > w - 80 && line) {
        ctx.fillText(line, x + 40, ly);
        ly += 30;
        line = word;
        if (ly > y + 188) break;
      } else {
        line = test;
      }
    }
    if (line && ly <= y + 190) ctx.fillText(line, x + 40, ly);
    ctx.restore();
    if (t > 1400 + i * 800 && t < 1400 + i * 800 + 900) {
      sparkles(ctx, x + w / 2, y + 60, tMs, t - (1400 + i * 800), { count: 8, radius: 130 });
    }
  });

  drawShortSource(ctx, s.source as string);
  drawShortHost(ctx, tl, tMs, 'present', clamp01((t - 1000) / 600), 0.5, 19);
}

/**
 * v6 (audit P2-2) — PARADOX resolves into the K, composed NATIVELY for
 * 9:16. Same choreography as the 16:9 scene: the word appears, the coral
 * strike cuts it, the K rises, the three takeaway lines land.
 */
function drawNativeVerticalParadox(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  tMs: number
): void {
  bokehField(ctx, W, H, tMs, { intensity: 0.9, seed: 55, gold: 0.55 });
  lightRays(ctx, W, H, tMs, { alpha: 0.45 });

  const beat = beatAt(tl, tMs);
  const t = beat ? Math.max(0, tMs - beat.startMs) : tMs % 4000;
  const cx = W / 2;

  // the word "PARADOX" appears, then strikes through
  const wp = clamp01(t / 700);
  const sp = clamp01((t - 1400) / 600);
  ctx.save();
  ctx.globalAlpha = wp;
  ctx.textAlign = 'center';
  setFont(ctx, 84, 700, FONT_DISPLAY);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText('PARADOX', cx, 500);
  if (sp > 0) {
    ctx.strokeStyle = PALETTE.down;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    const sw = 560;
    ctx.beginPath();
    ctx.moveTo(cx - sw / 2, 464);
    ctx.lineTo(cx - sw / 2 + sw * easeOutCubic(sp), 448);
    ctx.stroke();
  }
  ctx.restore();

  // resolves into K + takeaway lines
  const kp = clamp01((t - 2200) / 900);
  if (kp > 0) {
    ctx.save();
    ctx.globalAlpha = kp;
    drawK3D(ctx, cx, 800, 130, 1, tMs);
    ctx.restore();
  }
  const lines = [
    'record highs — and most of the country left behind',
    'because most of it was never really in the market',
    'and those in it have more riding on it than ever',
  ];
  lines.forEach((ln, i) => {
    const lp = clamp01((t - 2800 - i * 700) / 700);
    if (lp <= 0) return;
    ctx.save();
    ctx.globalAlpha = lp;
    ctx.textAlign = 'center';
    setFont(ctx, 28, 600, FONT_UI);
    ctx.fillStyle = i === 2 ? PALETTE.goldDeep : PALETTE.inkSoft;
    ctx.fillText(ln, cx, 975 + i * 48);
    ctx.restore();
  });

  drawShortHost(ctx, tl, tMs, 'aha', clamp01((t - 600) / 500), 0.5, 23);
}

/**
 * v6 (audit P2-2) — the recession-odds gauge, composed NATIVELY for 9:16.
 * The 16:9 scene splits debates-left / gauge-right; the phone stacks them:
 * both camps' quotes as full-width cards, the coin-flip gauge centred
 * beneath at hero scale, the 48% chip cradled under the dial.
 */
function drawNativeVerticalGauge(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  tMs: number
): void {
  bokehField(ctx, W, H, tMs, { intensity: 0.9, seed: 161, gold: 0.4 });
  lightRays(ctx, W, H, tMs, { alpha: 0.4 });

  const beat = beatAt(tl, tMs);
  const t = beat ? Math.max(0, tMs - beat.startMs) : tMs % 4000;
  const s = scenePropsAt(tl, tMs);

  // both camps, stacked full-width
  const debates = ((s.debates as any[]) || []).slice(0, 2);
  debates.forEach((d, i) => {
    const ap = clamp01((t - 400 - i * 600) / 700);
    if (ap <= 0) return;
    const x = 84;
    const w = W - 84 * 2;
    const y = 380 + i * 138;
    ctx.save();
    ctx.globalAlpha = ap;
    card(ctx, x, y, w, 124, { r: 24 });
    setFont(ctx, 26, 700, FONT_UI);
    ctx.textAlign = 'left';
    ctx.fillStyle = i === 0 ? PALETTE.up : PALETTE.down;
    ctx.fillText(d.who, x + 36, y + 44);
    setFont(ctx, 22, 600, FONT_UI);
    ctx.fillStyle = PALETTE.inkSoft;
    let line = '';
    const words = String(d.line).split(' ');
    let ly = y + 84;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > w - 72 && line) {
        ctx.fillText(line, x + 36, ly);
        ly += 28;
        line = word;
        if (ly > y + 112) break;
      } else {
        line = test;
      }
    }
    if (line && ly <= y + 114) ctx.fillText(line, x + 36, ly);
    ctx.restore();
  });

  // the gauge, centred at hero scale
  gauge(ctx, {
    cx: W * 0.5, cy: 870, r: 160,
    value: (s.gaugeTo as number) || 48,
    p: clamp01((t - 1200) / 2200),
    t,
    label: 'Zandi\u2019s model · most alarmed point',
  });

  // coin flip chip, cradled under the dial
  const cp = clamp01((t - 3200) / 700);
  if (cp > 0 && s.coinChip) {
    ctx.save();
    ctx.globalAlpha = cp;
    setFont(ctx, 27, 700, FONT_UI);
    const txt = s.coinChip as string;
    const tw = ctx.measureText(txt).width;
    const x = W * 0.5 - tw / 2 - 28;
    const y = 940;
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, x, y, tw + 56, 56, 28);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PALETTE.gold;
    roundRect(ctx, x, y, tw + 56, 56, 28);
    ctx.stroke();
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText(txt, x + 28, y + 37);
    ctx.restore();
  }

  drawShortSource(ctx, s.source as string);
}

/**
 * v6 (audit P2-2) — the gas pump, composed NATIVELY for 9:16. The pump
 * becomes the hero at full width; the two households sit side-by-side
 * beneath it — same country, same price shock, two different roads.
 */
function drawNativeVerticalPump(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  tMs: number
): void {
  bokehField(ctx, W, H, tMs, { intensity: 0.9, seed: 151, gold: 0.5 });
  lightRays(ctx, W, H, tMs, { alpha: 0.45 });

  const beat = beatAt(tl, tMs);
  const t = beat ? Math.max(0, tMs - beat.startMs) : tMs % 4000;
  const s = scenePropsAt(tl, tMs);

  // the pump (hero, centred)
  const px = W * 0.5;
  const py = 380;
  const ap = clamp01(t / 800);
  ctx.save();
  ctx.globalAlpha = ap;
  card(ctx, px - 120, py, 240, 370, { r: 26 });
  ctx.fillStyle = PALETTE.goldWash;
  roundRect(ctx, px - 95, py + 30, 190, 120, 18);
  ctx.fill();
  setFont(ctx, 44, 700, FONT_DISPLAY);
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.textAlign = 'center';
  ctx.fillText('GAS', px, py + 102);
  // price digits roll
  const roll = (t / 300) % 10;
  setFont(ctx, 40, 700, FONT_UI);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(`$${(3.2 + Math.abs(Math.sin(roll)) * 0.9).toFixed(2)}`, px, py + 220);
  // hose
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px + 120, py + 60);
  ctx.quadraticCurveTo(px + 200, py + 120, px + 150, py + 210);
  ctx.stroke();
  ctx.restore();
  floatCoins(ctx, px, py + 60, t, 4, 60);

  // two household cards, side by side
  const cards = ((s.cards as any[]) || []).slice(0, 2);
  cards.forEach((c, i) => {
    const cap = clamp01((t - 1000 - i * 900) / 800);
    if (cap <= 0) return;
    const x = i === 0 ? 84 : 540;
    const y = 800;
    ctx.save();
    ctx.globalAlpha = cap;
    ctx.translate(0, (1 - easeOutCubic(cap)) * 40);
    const tone = TONE(c.tone);
    card(ctx, x, y, 456, 250, { r: 26 });
    setFont(ctx, 24, 700, FONT_UI);
    ctx.fillStyle = tone.main;
    ctx.textAlign = 'left';
    ctx.fillText(String(c.who).toUpperCase(), x + 32, y + 52);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(tone.main, 0.4);
    ctx.beginPath();
    ctx.moveTo(x + 32, y + 72);
    ctx.lineTo(x + 180, y + 72);
    ctx.stroke();
    ((c.stats as string[]) || []).slice(0, 2).forEach((st, j) => {
      setFont(ctx, 38, 700, FONT_UI);
      ctx.fillStyle = j === 0 ? tone.main : PALETTE.ink;
      ctx.fillText(st, x + 32, y + 140 + j * 56);
    });
    ctx.restore();
  });

  if (t > 3000) sparkles(ctx, px, py + 180, tMs, t - 3000, { count: 8, radius: 150 });
  drawShortSource(ctx, s.source as string);
}

const NATIVE_SCENE_TYPES: Record<NativeMode, string> = {
  k: 'divergeK',
  text: 'bigText',
  stats: 'statCards',
  paradox: 'paradoxResolve',
  gauge: 'recessionGauge',
  pump: 'gasPump',
};

const NATIVE_DRAWERS: Record<NativeMode, (ctx: CanvasRenderingContext2D, W: number, H: number, tl: Timeline, tMs: number) => void> = {
  k: drawNativeVerticalK,
  text: drawNativeVerticalText,
  stats: drawNativeVerticalStats,
  paradox: drawNativeVerticalParadox,
  gauge: drawNativeVerticalGauge,
  pump: drawNativeVerticalPump,
};

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

  // 2) the hero band — v6: native composition while the timeline is inside
  //    this short's scene; the safe inset crop only as a fallback for spans
  //    that fall outside the six native moments
  const activeType = beatSceneTypeAt(tl, tMs);
  const native = spec.native && NATIVE_SCENE_TYPES[spec.native] === activeType
    ? NATIVE_DRAWERS[spec.native]
    : null;
  if (native) {
    native(ctx, W, H, tl, tMs);
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
    // rides the phone's screen edge
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

    // soft SIDE edges — some 16:9 scenes are wider than any 1034px window,
    // so the window can cross content. A 70px ivory taper on both sides
    // makes any residual boundary crossing read as intentional vignette.
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

  // 6) vertical karaoke captions — v6 (audit P2-2): native moments ride at
  //    62% frame height; the crop fallback keeps the raised baseY below the
  //    410–1490 crop band (v4, audit P0-3)
  drawCaptions(ctx, W, H, tMs, tl.captionLines, {
    mode: opts.captions,
    baseY: native ? CAPTION_BASE_NATIVE : 1560,
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
