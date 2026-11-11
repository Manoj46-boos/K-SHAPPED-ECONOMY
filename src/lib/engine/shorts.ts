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
import { paintBg, scenePlate, PALETTE, TONE, card, rgba, roundRect, setFont, FONT_DISPLAY, FONT_UI } from './theme';
import { renderVideo } from './encode';
import { getSharedAudioContext } from './audio';
import { clamp01, easeOutCubic, lerp } from './easing';
import { bokehField, drawK3D, lightRays, sparkles, floatCoins } from './effects';
import { Stickman, walkIn } from './stickman';
import { drawStickmanV2, talkAt } from './stickman-v2';
import { gauge, barRow, lineChart } from './charts';

/** AUDIT-2 / §10.5 (report Phase 4): the chapter tone rotation director.ts
 *  uses (same array, same indices — the Short travels the same color
 *  journey its parent beat lives in). */
const SHORT_TONES: Array<'up' | 'down' | 'gold' | 'neutral'> = [
  'neutral', 'up', 'down', 'down', 'up', 'neutral', 'gold', 'up', 'gold',
];

/** AUDIT-2 / §10.5: while the FACE-FIRST entry window is open, the native
 *  drawers' bottom-zone host stays suppressed (the entry host owns the
 *  frame) — set by drawShortFrame before the native drawer runs, consumed
 *  by drawShortHost. Pure function of (tMs, spec) per frame. */
let hostZoneFrom = Infinity;

/** v6 (audit P2-2): every strong moment composes natively — no crop.
 *  P1-4 (report): + 'bars' (barsCompare) and 'journey' (chartJourney) —
 *  the two data-scene families the report called out, both reusing the
 *  long-form's own chart renderers at 9:16 geometry. */
export type NativeMode = 'k' | 'text' | 'stats' | 'paradox' | 'gauge' | 'pump' | 'bars' | 'journey';

export interface ShortSpec {
  /** timeline ms where the short starts */
  startMs: number;
  /** duration of the short (ms) — P1-4: 35-45s, not 50s */
  durMs: number;
  /** headline shown in the top band */
  title: string;
  /** P1-4 (report): hook re-statements — a bold banner re-hooks the
   *  scroller at ~15s and ~30s (each shows for ~2.4s). */
  hooks?: string[];
  /** which 1080-wide slice of the 1920 design grid to crop: 0..0.44 (0.22 ≈ center).
   *  Fallback only — v6 renders the six strongest beats natively. */
  cropX: number;
  /** compose this moment NATIVELY in 9:16 instead of cropping the 16:9 frame */
  native?: NativeMode;
}

/** The six strongest vertical moments in the current script — all native.
 *  P1-4 (report) re-cut: 50s → 35-45s (the measured Shorts sweet spot for
 *  explainers), NUMBER-FIRST titles (the digit is the hook), and a hook
 *  re-statement every 15s so the swipe decision has to be made three times. */
export function pickShortMoments(tl: Timeline): ShortSpec[] {
  const byType = (t: string) => tl.beats.find((b) => b.beat.scene.type === t);
  const mk = (
    type: string,
    title: string,
    native: NativeMode,
    durMs: number,
    hooks: string[],
    cropX = 0.22,
    lead = 300
  ): ShortSpec | null => {
    const b = byType(type);
    if (!b) return null;
    return { startMs: b.startMs + lead, durMs, title, hooks, cropX, native };
  };
  const list = [
    // the signature moment: the K draws itself, host presenting
    // P1-4 hooks: every re-statement must add NEW information — the round-1
    // panel flagged a hook that merely repeated the title's numbers.
    // AUDIT-2 / §10.5 (report Phase 4): titles rewrite LOSS-FIRST — loss
    // framing beats gain framing on every retention study the panel cited
    // ("Your salary fell 12%." outperforms "+18% up." for the same fact).
    mk('divergeK', 'The market soared. You didn’t feel it.', 'k', 42_000,
      ['record highs AND a 10-year mood low', 'both lines are real — that’s the K']),
    // hard-cut statement beats — 108px serif lines cannot survive any crop
    mk('bigText', '493 stocks barely moved. 7 did everything.', 'text', 35_000,
      ['SEVEN stocks. Count them.', 'the other 493 barely move it'], 0.24),
    // the margin wall: $4.42T / 12.4% stacked full-width
    mk('statCards', '$4.42T went up top. 12.4% reached you.', 'stats', 40_000,
      ['$4.42 TRILLION. Record.', 'workers kept 12.4% of it'], 0.045),
    // PARADOX struck through, resolves into the K
    mk('paradoxResolve', '2 truths. 0 paradox.', 'paradox', 38_000,
      ['both lines are real', 'it’s a K — not a paradox'], 0.2),
    // the 48% coin-flip gauge with both camps' quotes
    mk('recessionGauge', 'Recession: a 48% coin flip.', 'gauge', 45_000,
      ['48% say recession', 'the other 52% say growth'], 0.42),
    // same pump, two households, two roads
    mk('gasPump', '1 pump. 2 worlds.', 'pump', 42_000,
      ['same gas price for both', 'one budget bends, one breaks'], 0.15),
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
/** Presenter ground line in the bottom-left presenter zone.
 *  AUDIT-3 / §1.6 (report Phase 1.6 — Shorts re-stage): 1450 → 1470. The
 *  presenter drops 20px closer to the new bottom engagement band so the
 *  composition tightens toward the middle 70% and the dead gap below his
 *  feet shrinks. (Horizontal clearance to the caption pill is unchanged —
 *  the pill constraint is an x-axis one.) */
const HOST_GROUND = 1470;

/** v6: the host, bottom-left of the presenter zone, clear of the pill/rail.
 *  P1-1/P1-4 (report): 0.9 → 1.12 (+24%) and x 165 → 132 — the 9:16
 *  presenter zone is tighter than 16:9, but with Shorts captions now
 *  1-row/6-word (drawShortFrame) the widest pill's left edge sits at x≈196:
 *  at 1.12/x120 the head's worst-case right edge (max lean, ≈193) stays
 *  clear of even that, with the feet envelope inside the frame. The panel's
 *  round-1 note ('only marginally larger') moved the bump from 1.05 to 1.12. */
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
  // AUDIT-2 / §10.5: suppressed while the face-first entry host owns the
  // frame (see drawShortFrame).
  if (tMs < hostZoneFrom) return;
  const speaking = tl.voIntervals.some((v) => tMs >= v.start - 150 && tMs <= v.end + 250);
  const pose = Stickman.poseAt(tMs, { gesture, speaking });
  let talk = 0;
  const line = tl.captionLines.find((l) => tMs >= l.start - 120 && tMs <= l.end + 260);
  if (line && speaking) {
    talk = talkAt(tMs - line.start, line.words.map((w) => w.t - line.start));
  }
  drawStickmanV2(ctx, 120, HOST_GROUND, 1.12, tMs, { pose, alpha, look, talk }, seed);
}

/** Small centered source credit above the channel mark (data scenes). */
function drawShortSource(ctx: CanvasRenderingContext2D, source: string | undefined): void {
  if (!source) return;
  ctx.save();
  setFont(ctx, 28, 400, FONT_UI); // v9 (D-07): floor
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
  if (t > 1800) sparkles(ctx, W / 2, bandCy, tMs, 1800, { count: 10, radius: 240 }); // PANEL-12/P2-4: dead t0 fixed

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

  const beat = tl.beats.find((b) => tMs >= b.startMs && tMs < b.endMs);
  const t = beat ? Math.max(0, tMs - beat.startMs) : tMs % 4000;
  // P2-5 (audit Table 4 — "K at max scale"): the K grows from 210 to 300
  // as the reveal completes — the payoff moment fills the hero band
  // (span 415–1045 at full growth, clear of the caption zone 1116+).
  const S = 210 + 90 * clamp01((t - 3000) / 1200);

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
  // P2-5 (100-judge audit, Table 4 — "12.4% as a FULL-BLEED number"): the
  // phone panel scored the stat Short 3/10 for thumb-stop — "nobody
  // thumb-stops for a pale green rectangle" (the opening 600ms was empty
  // atmosphere). The Short now OPENS on the number itself: 12.4% slams in
  // at ~300px display serif, full-bleed gold, with the loss kicker under
  // it — the swipe decision frame IS the statistic — then dissolves as
  // the card stack lands.
  const openP = clamp01(t / 260) * clamp01((1750 - t) / 550);
  if (openP > 0) {
    ctx.save();
    ctx.globalAlpha = openP;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    setFont(ctx, 300, 700, FONT_DISPLAY);
    ctx.fillStyle = PALETTE.goldDisplay;
    ctx.fillText('12.4%', W / 2, 880);
    setFont(ctx, 46, 700, FONT_UI);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText('of it reached you', W / 2, 1010);
    ctx.fillStyle = PALETTE.gold;
    roundRect(ctx, W / 2 - 220, 1050, 440 * clamp01(t / 400), 8, 4);
    ctx.fill();
    ctx.restore();
  }
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
      setFont(ctx, 28, 600, FONT_UI); // v9 (D-07): 24→28 floor
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
    setFont(ctx, 28, 600, FONT_UI); // v9 (D-07): floor
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
    setFont(ctx, 28, 700, FONT_UI); // v9 (D-07): floor
    ctx.textAlign = 'left';
    ctx.fillStyle = i === 0 ? PALETTE.up : PALETTE.down;
    ctx.fillText(d.who, x + 36, y + 44);
    setFont(ctx, 28, 600, FONT_UI); // v9 (D-07): 24→28 floor
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
    setFont(ctx, 28, 700, FONT_UI); // v9 (D-07): floor
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
  // PANEL-9 R7l (stat text overflowing into the neighbour card): the cards
  // were 456 wide at x=84/540 — touching with ZERO gap — and the 38px stat
  // lines were drawn unmeasured, so 'driving · barely changed' (~500px) ran
  // ~110px past its 392px text column into the LOWER-INCOME card (flagged
  // on the S6 render). Cards are now 444 wide with a 16px gutter, and each
  // stat auto-shrinks to its column (floor 26px) or wraps to two rows.
  const cards = ((s.cards as any[]) || []).slice(0, 2);
  cards.forEach((c, i) => {
    const cap = clamp01((t - 1000 - i * 900) / 800);
    if (cap <= 0) return;
    const x = i === 0 ? 84 : 552;
    const cw2 = 444;
    const y = 800;
    ctx.save();
    ctx.globalAlpha = cap;
    ctx.translate(0, (1 - easeOutCubic(cap)) * 40);
    const tone = TONE(c.tone);
    card(ctx, x, y, cw2, 250, { r: 26 });
    setFont(ctx, 28, 700, FONT_UI); // v9 (D-07): floor
    ctx.fillStyle = tone.main;
    ctx.textAlign = 'left';
    ctx.fillText(String(c.who).toUpperCase(), x + 32, y + 52);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(tone.main, 0.4);
    ctx.beginPath();
    ctx.moveTo(x + 32, y + 72);
    ctx.lineTo(x + 180, y + 72);
    ctx.stroke();
    const maxSW = cw2 - 64;
    let sy = y + 140;
    ((c.stats as string[]) || []).slice(0, 2).forEach((st, j) => {
      let size = 38;
      setFont(ctx, size, 700, FONT_UI);
      while (ctx.measureText(st).width > maxSW && size > 26) {
        size -= 2;
        setFont(ctx, size, 700, FONT_UI);
      }
      ctx.fillStyle = j === 0 ? tone.main : PALETTE.ink;
      if (ctx.measureText(st).width <= maxSW) {
        ctx.fillText(st, x + 32, sy);
        sy += 56;
      } else {
        const words = String(st).split(' ');
        const rows2: string[] = [];
        let line = '';
        for (const wd of words) {
          const test = line ? line + ' ' + wd : wd;
          if (ctx.measureText(test).width > maxSW && line) {
            rows2.push(line);
            line = wd;
          } else {
            line = test;
          }
        }
        if (line) rows2.push(line);
        rows2.slice(0, 2).forEach((r) => {
          ctx.fillText(r, x + 32, sy);
          sy += 36;
        });
      }
    });
    ctx.restore();
  });

  if (t > 3000) sparkles(ctx, px, py + 180, tMs, 3000, { count: 8, radius: 150 }); // PANEL-12/P2-4: dead t0 fixed
  drawShortSource(ctx, s.source as string);
}

/**
 * P1-4 (report) — barsCompare, composed NATIVELY for 9:16. The 16:9 scene
 * lays its comparison bars across a 1300px row — any crop window amputates
 * the labels. Here the SAME barRow renderer (identical label / track /
 * gradient / value-pill grammar as the film) runs full-width, stacked in the
 * hero zone, with the flip counter and remember chip compacted below and
 * the presenter in the presenter zone.
 */
function drawNativeVerticalBars(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  tMs: number
): void {
  bokehField(ctx, W, H, tMs, { intensity: 0.9, seed: 71, gold: 0.45 });
  lightRays(ctx, W, H, tMs, { alpha: 0.4 });

  const beat = beatAt(tl, tMs);
  const t = beat ? Math.max(0, tMs - beat.startMs) : tMs % 4000;
  const s = scenePropsAt(tl, tMs);
  const bars = ((s.bars as any[]) || []).slice(0, 4);

  const x = 84;
  // rail-safe width (ends x 940, clear of the Shorts action rail ~x 980+):
  // the longest bar's value pill lands past the bar's end, so the bar row
  // must stop short of the full 912px (round-2 panel caught '+20% best'
  // running under the rail at w=912)
  const w = 856;
  const yMax = (s.yMax as number) || Math.max(...bars.map((b) => b.value), 1) * 1.15;
  const rowH = 128;
  const y0 = 402;
  bars.forEach((b, i) => {
    const p = clamp01((t - 400 - i * 620) / 900);
    if (p <= 0) return;
    // rail-safe tag: the barRow tag chip lands ~300px past the bar's end —
    // on the longest bar that crosses the Shorts action rail (round-2 panel
    // caught '+20% best' at x~1080). The chip drops when it wouldn't fit
    // inside x 940; the value pill (which fits) always stays.
    let tag: string | undefined = b.tag;
    if (tag) {
      setFont(ctx, 28, 600, FONT_UI);
      const bw = Math.max(30, (b.value / yMax) * w * clamp01(p / 0.55));
      if (x + bw + 18 + 108 + ctx.measureText(tag).width + 30 > 940) tag = undefined;
    }
    barRow(ctx, {
      x, y: y0 + i * rowH, w, rowH,
      label: b.label, value: b.value, maxV: yMax,
      p, tone: b.tone, tag,
    });
    if (t > 1300 + i * 620 && t < 1300 + i * 620 + 800) {
      sparkles(ctx, x + w * 0.5, y0 + i * rowH + 40, tMs, t - (1300 + i * 620), { count: 8, radius: 140 });
    }
  });

  // flip counter (ownership rate) — compact card under the bars
  const fc = s.flipCounter as any | undefined;
  if (fc) {
    const ap = clamp01((t - 2600) / 900);
    if (ap > 0) {
      const fy = y0 + bars.length * rowH + 8;
      ctx.save();
      ctx.globalAlpha = ap;
      card(ctx, x, fy, w, 118, { r: 24 });
      setFont(ctx, 58, 700, FONT_DISPLAY);
      ctx.fillStyle = PALETTE.down;
      ctx.textAlign = 'left';
      const v = fc.from + (fc.to - fc.from) * easeOutCubic(ap);
      ctx.fillText(`${v.toFixed(0)}%`, x + 36, fy + 76);
      setFont(ctx, 28, 600, FONT_UI); // v9 (D-07): floor
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.fillText(fc.label, x + 190, fy + 52);
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.fillText(fc.tag, x + 190, fy + 88);
      ctx.restore();
    }
  }

  // remember chip — the scene's kicker, gold language, centred
  const rc = s.rememberChip as string | undefined;
  if (rc) {
    const ap = clamp01((t - 3600) / 800);
    if (ap > 0) {
      setFont(ctx, 28, 600, FONT_UI); // v9 (D-07): floor
      const tw = ctx.measureText(rc).width;
      const cx = W / 2 - tw / 2 - 28;
      const cy = 1040;
      ctx.save();
      ctx.globalAlpha = ap;
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, cx, cy, tw + 56, 54, 27);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PALETTE.gold;
      roundRect(ctx, cx, cy, tw + 56, 54, 27);
      ctx.stroke();
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.textAlign = 'left';
      ctx.fillText(rc, cx + 28, cy + 36);
      ctx.restore();
    }
  }

  drawShortSource(ctx, s.source as string);
  drawShortHost(ctx, tl, tMs, 'present', clamp01((t - 900) / 600), 0.5, 19);
}

/**
 * P1-4 (report) — chartJourney, composed NATIVELY for 9:16. The film's own
 * lineChart renderer (draw-on animation, annotations, bands, dated x-axis)
 * at full phone width in the hero zone, with the legend above and up to two
 * extra-stat chips below. The chart IS the hero — no cropping, no letterbox.
 */
function drawNativeVerticalJourney(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tl: Timeline,
  tMs: number
): void {
  bokehField(ctx, W, H, tMs, { intensity: 0.9, seed: 81, gold: 0.4 });
  lightRays(ctx, W, H, tMs, { alpha: 0.4 });

  const beat = beatAt(tl, tMs);
  const t = beat ? Math.max(0, tMs - beat.startMs) : tMs % 4000;
  const s = scenePropsAt(tl, tMs);
  const bt = beat ? Math.max(0, tMs - beat.startMs) : tMs;

  const series = ((s.series as any[]) || []).map((sr) => ({
    name: sr.name as string,
    tone: sr.tone as string,
    points: sr.points as [number, number][],
  }));
  const single = series.length
    ? series
    : [{ name: '', tone: 'up', points: (s.points as [number, number][]) || [] }];

  // legend (multi-series only), above the chart
  if (series.length > 1) {
    single.forEach((sr, i) => {
      const lx = 84 + i * 470;
      const ap = clamp01((t - 250 - i * 180) / 450);
      ctx.save();
      ctx.globalAlpha = ap;
      ctx.fillStyle = TONE(sr.tone).main;
      roundRect(ctx, lx, 420, 46, 12, 6);
      ctx.fill();
      setFont(ctx, 28, 600, FONT_UI); // v9 (D-07): floor
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.textAlign = 'left';
      ctx.fillText(sr.name, lx + 58, 432);
      ctx.restore();
    });
  }

  // the chart — the film's own renderer, hero zone. Width ends at x 940 so
  // right-edge annotations stay clear of the Shorts action rail (~x 980+).
  const extraStats = ((s.extraStats as any[]) || []).slice(0, 2);
  const chartH = extraStats.length ? 470 : 540;
  lineChart(ctx, {
    x: 84, y: 460 + (series.length > 1 ? 34 : 0), w: 856, h: chartH,
    series: single,
    annotations: (s.annotations as any[]) || [],
    band: s.band as any,
    peakBand: s.peakBand as any,
    p: clamp01(t / 2600),
    t,
    yFormat: ((s.yFormat as string) || 'index') as any,
    xLabels: [
      { at: 0, label: 'last Oct' },
      { at: 11, label: 'Mar' },
      { at: 20, label: 'Jun' },
      { at: 40, label: 'today' },
    ],
    revealFrac: s.phase === 'recovery' ? Math.max(0.75, clamp01((bt - 800) / 4000)) : undefined,
  });

  // extra stat chips below the chart (rail-safe width, matching the chart)
  extraStats.forEach((st, i) => {
    const ap = clamp01((bt - 1400 - i * 500) / 700);
    if (ap <= 0) return;
    const c = TONE(st.tone || 'default');
    const cy = 460 + (series.length > 1 ? 34 : 0) + chartH + 26 + i * 78;
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.fillStyle = c.soft;
    roundRect(ctx, 84, cy, 856, 66, 33);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(c.main, 0.4);
    roundRect(ctx, 84, cy, 856, 66, 33);
    ctx.stroke();
    setFont(ctx, 36, 700, FONT_UI);
    ctx.fillStyle = c.main;
    ctx.textAlign = 'left';
    ctx.fillText(st.big, 120, cy + 46);
    setFont(ctx, 28, 600, FONT_UI); // v9 (D-07): floor
    ctx.fillStyle = PALETTE.inkSoft;
    const label = st.label.length > 42 ? st.label.slice(0, 41) + '…' : st.label;
    ctx.fillText(label, 250, cy + 43);
    ctx.restore();
  });

  drawShortSource(ctx, s.source as string);
  drawShortHost(ctx, tl, tMs, 'present', clamp01((t - 1000) / 600), 0.5, 23);
}

const NATIVE_SCENE_TYPES: Record<NativeMode, string> = {
  k: 'divergeK',
  text: 'bigText',
  stats: 'statCards',
  paradox: 'paradoxResolve',
  gauge: 'recessionGauge',
  pump: 'gasPump',
  bars: 'barsCompare',
  journey: 'chartJourney',
};

const NATIVE_DRAWERS: Record<NativeMode, (ctx: CanvasRenderingContext2D, W: number, H: number, tl: Timeline, tMs: number) => void> = {
  k: drawNativeVerticalK,
  text: drawNativeVerticalText,
  stats: drawNativeVerticalStats,
  paradox: drawNativeVerticalParadox,
  gauge: drawNativeVerticalGauge,
  pump: drawNativeVerticalPump,
  bars: drawNativeVerticalBars,
  journey: drawNativeVerticalJourney,
};

/** PANEL-9 R7i (mid-short crop clipping): reverse map scene type → native
 *  mode. A Short spans 50s of timeline — after its opening moment ends the
 *  frame lands on whatever scene plays next, and the old logic fell back to
 *  the 1034px safe crop of the 16:9 render, which amputates wide scenes
 *  (statCards' 1700px card row: "…D" / "…gins" clipped at the window edge,
 *  the sources chip cut on the right — flagged on the S1 render). With the
 *  reverse map, ANY scene that has a native 9:16 composition gets it for
 *  the whole span; only scenes with no native drawer fall back to the crop. */
const NATIVE_BY_SCENE_TYPE: Record<string, NativeMode> = Object.fromEntries(
  (Object.keys(NATIVE_SCENE_TYPES) as NativeMode[]).map((m) => [NATIVE_SCENE_TYPES[m], m])
);

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
  // AUDIT-2 / 0.3 (report §10.1, F1): THE TONE PLATE — the identical
  // scenePlate call every 16:9 scene makes, in the chapter's tone. The
  // measured BEFORE frame was 92.1% near-white against the film's own 58%
  // acceptance bar: on a phone, in the feed, the Short read as a blank
  // page with a headline on it. One call brings every vertical frame
  // inside the bar the rest of the film already meets.
  {
    const ch = beatAt(tl, tMs)?.chapter ?? 0;
    scenePlate(ctx, W, H, SHORT_TONES[Math.min(ch, SHORT_TONES.length - 1)]);
  }

  // 2) the hero band — v6: native composition while the timeline is inside
  //    this short's scene; the safe inset crop only as a fallback for spans
  //    that fall outside the six native moments.
  //    PANEL-9 R7i: the native check now routes on the ACTIVE scene type —
  //    a Short that plays past its opening moment keeps native 9:16 layouts
  //    for every scene that has one (statCards, bigText, gauge, …) instead
  //    of dropping to the 1034px crop that amputates wide 16:9 scenes.
  const activeType = beatSceneTypeAt(tl, tMs);
  const nativeMode = activeType ? NATIVE_BY_SCENE_TYPE[activeType] : undefined;
  const native = nativeMode ? NATIVE_DRAWERS[nativeMode] : null;
  // AUDIT-2 / §10.5: the native drawers' presenter-zone host stays
  // suppressed while the face-first entry window is open.
  hostZoneFrom = spec.startMs + 2000;
  if (native) {
    native(ctx, W, H, tl, tMs);
  } else {
    // scene frame with captions/watermark/progress suppressed — we
    // re-caption vertically below
    const octx = offscreen.getContext('2d')!;
    drawFrame(octx, tl, tMs, {
      ...opts,
      captions: 'off',
      progressBar: false,
      watermark: false,
    });

    // PANEL-9 R7j (fallback amputates 16:9 scenes): the old fallback cropped
    // a 1034px window out of the 1920px frame at full scale — every scene
    // wider than the window lost content at the window edge (S1: stat cards
    // "…D"/"…gins" cut at the left, the sources chip cut at the right; S2:
    // axis labels and bar-value pills clipped both sides). The fallback now
    // LETTERBOXES the entire 16:9 frame, fit to canvas width, centred in the
    // hero band on a soft-shadow matte — every scene is fully visible at
    // 0.5625 scale. The six hero moments still get their full-size native
    // drawers (R7i), and the vertical captions + title band stay full-size,
    // so the small inset type is context, never the reading surface.
    const fw = W;
    const fh = fw * (1080 / 1920); // 607.5
    const fy = 410 + (1080 - fh) / 2;
    // P2-5 (audit Table 4 — "kill letterboxed panels"): the phone panel
    // read the v5 inset-card matte as a letterboxed TV on a phone ("a
    // mounted plate"). The fallback now speaks the PLATFORM's own
    // grammar: the 16:9 frame scaled to FILL the 9:16 canvas, heavily
    // blurred and dimmed — a full-bleed ambient field — with the sharp
    // frame floating centred on it. No card matte, no hairline, no bars:
    // every pixel of the Short is either the moment or its atmosphere.
    ctx.save();
    try { ctx.filter = 'blur(26px)'; } catch { /* older canvas: unblurred fill still full-bleed */ }
    const fhFull = W * (1920 / 1080); // 1920 tall at canvas width
    ctx.drawImage(offscreen, 0, 0, 1920, 1080, (W - W) / 2, (H - fhFull) / 2, W, fhFull);
    ctx.filter = 'none';
    ctx.fillStyle = rgba(PALETTE.bgTop, 0.34);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.drawImage(offscreen, 0, 0, 1920, 1080, 0, fy, fw, fh);
  }

  // 2b) AUDIT-2 / §10.5 (report Phase 4): FACE-FIRST ENTRY. The swipe
  //     decision is made in 1-3 seconds on a frozen first frame; faces
  //     are the number-one thumb-stopper. For the first ~1.4s of every
  //     Short the host stands LARGE in the upper third — face at ~38%
  //     frame height, eye contact with the lens, presenting — then WALKS
  //     DOWN to the presenter zone as the content band takes over: the
  //     Short starts mid-action, on the move, never as a static page.
  //     Scrub-deterministic (every term is a pure function of tMs).
  {
    const rel = tMs - spec.startMs;
    if (rel >= 0 && rel < 2000) {
      const speaking = tl.voIntervals.some((v) => tMs >= v.start - 150 && tMs <= v.end + 250);
      if (rel < 1400) {
        const ap = clamp01(rel / 220);
        const pose = Stickman.poseAt(tMs, {
          gesture: 'heroPresent', speaking,
          sentenceId: 'short-entry', prevSentenceId: 'short-entry',
          sentenceT: Math.min(rel, 420), wordTimes: [],
        });
        // panel round note: "consider 1.5x head scale" — the faceScale rig
        // exists for exactly this; the swipe-stop face gets 35% more face.
        drawStickmanV2(ctx, W * 0.22, 1140, 1.52, tMs, { pose, alpha: ap, look: 0.2, faceScale: 1.35 }, 41);
      } else {
        const wp = clamp01((rel - 1400) / 600);
        // AUDIT-3 / Walk 3.0: rigScale term keeps the planted foot exact
        // through the scale-down (1.52 → 1.12, ~1.3 mid-walk).
        const w = walkIn(wp * 600, W * 0.22, 120, 600, undefined, 1.3);
        const gy = lerp(1140, HOST_GROUND, easeOutCubic(wp));
        const sc = lerp(1.52, 1.12, easeOutCubic(wp));
        // AUDIT-3 / §2.4: the landing squash — he ARRIVES at the presenter
        // zone with a 300ms volume-preserving compress about his feet (the
        // walk-down ends on a plant, not a glide).
        const sinceLand = rel - 2000;
        const squash = wp >= 1 && sinceLand >= 0 && sinceLand < 300
          ? Math.sin((sinceLand / 300) * Math.PI)
          : 0;
        drawStickmanV2(ctx, w.x, gy, sc, tMs, {
          pose: w.pose, alpha: 1, look: 0.5, squash,
          walkPhase: w.walking ? w.phase : undefined,
        }, 41);
      }
    }
  }

  // 5) top title band — 2 lines max, mobile-first, clear of the top UI.
  // v7: the first 0.35s scales the band 1.14→1.00 and grows the underline —
  // Shorts open on motion (73.6% average viewed leaves no room for a static
  // start). Entry time is short-relative (tMs arrives as full-timeline time).
  const inP = easeOutCubic(clamp01((tMs - spec.startMs) / 350));
  ctx.save();
  ctx.translate(W / 2, 250);
  const bandS = 0.86 + 0.14 * inP;
  ctx.scale(bandS, bandS);
  ctx.translate(-W / 2, -250);
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
  ctx.fillStyle = PALETTE.up;                                // v7: teal underline, grows with the entry
  roundRect(ctx, W / 2 - 70 * inP, 250 + Math.min(rows.length, 2) * 66 - 10, 140 * inP, 8, 4);
  ctx.fill();
  ctx.restore();

  // 5b) P1-4 (report): HOOK RE-STATEMENTS — at ~15s and ~30s into the Short
  //     a bold banner re-hooks the scroller (each shows ~2.4s, slides in
  //     from the left, uses the title band's own plate language). The swipe
  //     decision has to be made three times, not once.
  if (spec.hooks?.length) {
    const HOOK_AT = [15_000, 30_000];
    const HOOK_DUR = 2_400;
    spec.hooks.slice(0, HOOK_AT.length).forEach((hook, i) => {
      const rel = tMs - spec.startMs - HOOK_AT[i];
      if (rel < 0 || rel > HOOK_DUR) return;
      const pin = easeOutCubic(clamp01(rel / 420));
      const out = 1 - clamp01((rel - HOOK_DUR + 320) / 320);
      ctx.save();
      ctx.globalAlpha = Math.min(pin, out);
      setFont(ctx, 44, 700, FONT_DISPLAY);
      const tw = ctx.measureText(hook).width;
      const bw = Math.min(tw + 72, W - 96);
      const bx = -bw + ((W - bw) / 2 + bw) * pin; // slides from off-left to centred
      const by = 372;
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, bx, by, bw, 86, 24);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = PALETTE.gold;
      roundRect(ctx, bx, by, bw, 86, 24);
      ctx.stroke();
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = 'center';
      // fit the hook inside the plate (shrink, never clip)
      let hs = 44;
      while (ctx.measureText(hook).width > bw - 64 && hs > 30) {
        hs -= 2;
        setFont(ctx, hs, 700, FONT_DISPLAY);
      }
      ctx.fillText(hook, bx + bw / 2, by + 56);
      ctx.restore();
    });
  }

  // 6) vertical karaoke captions — v6 (audit P2-2): native moments ride at
  //    62% frame height; the crop fallback keeps the raised baseY below the
  //    410–1490 crop band (v4, audit P0-3)
  //    P1-1/P1-4 (report): Shorts captions are ONE row, six words — the
  //    swipe-through surface reads at a glance, and the 2-row band (top
  //    y≈1104) never opens over the presenter zone.
  drawCaptions(ctx, W, H, tMs, tl.captionLines, {
    mode: opts.captions,
    baseY: native ? CAPTION_BASE_NATIVE : 1560,
    maxRows: 1,
    maxWords: 6,
  });

  // 7) AUDIT-3 / §1.6 (report Phase 1.6 — kill the dead bottom third): THE
  //    BOTTOM ENGAGEMENT BAND. The BEFORE panel measured ~430px of dead air
  //    below the presenter ("thumb-hesitation territory… 22% of the canvas
  //    with zero compositional pull") and prescribed exactly this: a
  //    progress bar / chapter ticker / branding lockup in the bottom band.
  //    The band = hairline top rule + channel wordmark with the gold K
  //    glyph + a slim progress track with ticks at the two hook
  //    re-statements (15s / 30s) — functional furniture that pulls the eye
  //    down the frame instead of off it. Deterministic in (tMs, spec).
  {
    const rel = tMs - spec.startMs;
    const prog = clamp01(rel / Math.max(1, spec.durMs));
    const bandIn = easeOutCubic(clamp01((rel - 260) / 500));
    ctx.save();
    ctx.globalAlpha = bandIn;
    // hairline rule — the band's top edge
    ctx.strokeStyle = rgba(PALETTE.grid, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(72, 1712);
    ctx.lineTo(W - 72, 1712);
    ctx.stroke();
    // channel wordmark + the gold K glyph, centred
    setFont(ctx, 28, 600);
    const mark = opts.channelName.toUpperCase();
    const mw = ctx.measureText(mark).width;
    const kx0 = W / 2 - (mw + 46) / 2;
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText(mark, kx0 + 46, 1766);
    // the K glyph — the brand mark, sized to the wordmark
    ctx.save();
    ctx.translate(kx0 + 16, 1752);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, -14);
    ctx.moveTo(2, 0);
    ctx.lineTo(15, -14);
    ctx.moveTo(2, 0);
    ctx.lineTo(15, 14);
    ctx.stroke();
    ctx.restore();
    // the progress track — slim, rounded, gold fill, hook ticks
    const tw = W - 144;
    const ty = 1806;
    ctx.fillStyle = rgba(PALETTE.track, 0.9);
    roundRect(ctx, 72, ty - 5, tw, 10, 5);
    ctx.fill();
    const fw = tw * prog * bandIn;
    if (fw > 8) {
      ctx.fillStyle = PALETTE.gold;
      roundRect(ctx, 72, ty - 5, fw, 10, 5);
      ctx.fill();
    }
    // hook ticks — where the next re-hook lands (15s / 30s)
    for (const hk of [15_000, 30_000]) {
      const hp = hk / Math.max(1, spec.durMs);
      if (hp >= 1) continue;
      ctx.fillStyle = PALETTE.inkSoft;
      roundRect(ctx, 72 + tw * hp - 2, ty - 12, 4, 24, 2);
      ctx.fill();
    }
    ctx.restore();
  }
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
    // PANEL-9 R7n: silenceWindows were dropped here — the shifted Short
    // timeline failed the Timeline type (pre-existing tsc error) and, worse,
    // the music bed's duck-for-silence logic (audio.ts) silently lost every
    // silence window in the encoded Shorts. Shift + clamp like cutTimes.
    silenceWindows: tl.silenceWindows
      .map((w) => ({ start: w.start - startMs, end: w.end - startMs }))
      .filter((w) => w.end > 0)
      .map((w) => ({ start: Math.max(0, w.start), end: w.end })),
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
