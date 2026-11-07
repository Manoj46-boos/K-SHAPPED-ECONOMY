/**
 * On-screen text system: karaoke captions synced to word timings,
 * chapter transition cards, corner watermark, thin gold progress bar.
 */

import { clamp01, easeInOutSine, easeOutCubic, easeOutQuad } from './easing';
import { PALETTE, FONT_UI, FONT_DISPLAY, rgba, roundRect, setFont } from './theme';
import { Stickman } from './stickman';
import { drawStickmanV2 } from './stickman-v2';

export interface CaptionWord {
  t: number; // ms, absolute timeline time
  d: number;
  w: string;
}

export interface CaptionLine {
  start: number; // ms absolute
  end: number;
  words: CaptionWord[];
}

export interface CaptionStyle {
  mode: 'karaoke' | 'simple' | 'off';
  /** Optional baseline Y (design px) for the pill bottom edge. Defaults to
   *  H-128 — the Shorts 9:16 pipeline passes a higher baseY so the caption
   *  clears the YouTube Shorts overlay zone. (v3, panel P2-1) */
  baseY?: number;
}

/**
 * Draw the active caption. Returns nothing; safely no-ops when inactive.
 *
 * v2 (PATCH 4): the old pill could span W-520px at 0.94 alpha — on host
 * scenes it ate ~20-25% of the frame and fought the scene art, and
 * unspoken words sat at 0.42 grey (contrast fail). Now: pill hard-capped
 * at 62% of frame width, one line preferred / two max, a gold brand tab
 * on the left edge, spoken words at full ink, upcoming at 55% ink, and
 * the active word gets a crisp gold underline sweep.
 */
export function drawCaptions(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tMs: number,
  lines: CaptionLine[],
  style: CaptionStyle
): void {
  if (style.mode === 'off' || !lines.length) return;
  let active: CaptionLine | null = null;
  for (const l of lines) {
    if (tMs >= l.start - 120 && tMs <= l.end + 260) active = l;
  }
  if (!active) return;

  const words = active.words;
  // v8: 40→46px, 600→700 weight. The vision panel measured the caption as
  // the smallest reading text on a phone in landscape — the majority view
  // for finance explainers. 46px/1080 = 4.26% of frame height, inside
  // YouTube's own caption register; the extra weight survives the platform
  // transcode at 480p.
  const fontSize = 46;
  const maxW = Math.min(W - 460, W * 0.66); // hard cap: 66% of frame
  setFont(ctx, fontSize, 700, FONT_UI);
  const spaceW = ctx.measureText(' ').width;

  // sliding window: 4 spoken words back (v8: was 6 — a shorter read-ahead
  // makes the karaoke sweep punchier and the pill narrower), fill forward
  let winStart = 0;
  let lastSpoken = -1;
  for (let i = 0; i < words.length; i++) {
    if (tMs >= words[i].t) lastSpoken = i;
  }
  if (lastSpoken > 4) winStart = lastSpoken - 3;
  const winWords = words.slice(winStart);

  const rows: { words: CaptionWord[]; width: number }[] = [{ words: [], width: 0 }];
  let cur = 0;
  for (const w of winWords) {
    const ww = ctx.measureText(w.w).width;
    if (rows[cur].width + ww > maxW && rows[cur].words.length > 0) {
      // two rows max — never a wall of text. (The v1 `push then break` order
      // built a phantom third row; this stops BEFORE creating it.)
      if (rows.length >= 2) break;
      rows.push({ words: [], width: 0 });
      cur++;
    }
    rows[cur].words.push(w);
    rows[cur].width += ww + spaceW;
  }

  const rowH = fontSize + 16;
  const totalH = rows.length * rowH + 36;
  const baseY = style.baseY ?? H - 128; // clear of the 8px progress bar + safe margin
  const widest = Math.max(...rows.map((r) => r.width));

  // pill — fully opaque plate (scene text under it must occlude cleanly,
  // not ghost through), one hairline border, gold brand tab on the left
  ctx.save();
  const px = W / 2 - widest / 2 - 34;
  const py = baseY - totalH + 4;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, px, py, widest + 68, totalH, 30);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(PALETTE.muted, 0.5);                // v5: cool-grey hairline
  roundRect(ctx, px, py, widest + 68, totalH, 30);
  ctx.stroke();
  ctx.fillStyle = PALETTE.up;                                 // v5: teal tab — the voice
  roundRect(ctx, px + 2, py + 14, 8, totalH - 28, 4);
  ctx.fill();
  ctx.restore();

  // words — spoken = ink, upcoming = 42% ink (v8: was 55% — wider
  // spoken/unspoken contrast makes the sweep readable at a glance),
  // active = sweep
  ctx.save();
  ctx.textBaseline = 'middle';
  setFont(ctx, fontSize, 700, FONT_UI);
  rows.forEach((row, ri) => {
    let x = W / 2 - row.width / 2 + spaceW / 2;
    const y = py + 26 + ri * rowH + fontSize / 2;
    for (const w of row.words) {
      const spoken = tMs >= w.t;
      const activeW = spoken && tMs <= w.t + w.d + 90;
      // PANEL-9 R1 (caption contrast): upcoming words were rgba(...,0.42) —
      // measured ~2.2:1 on white, illegible on phones and read by every
      // vision judge as a "ghost rendering bug".
      // R1b (panel re-review REJECTED 0.66): #4F5D59 at 0.66 over white
      // blends to rgb(139,148,145) ≈ 3.1:1 — still below the 4.5:1 the
      // panel requires for pre-read text. 0.85 blends to rgb(105,117,114)
      // ≈ 4.8:1 (WCAG AA pass), while the spoken state stays ink #2E4A43
      // at ≈9.6:1 — the spoken/unspoken hierarchy survives (≈2:1 between
      // the two states, plus the karaoke active-word sweep).
      ctx.fillStyle = spoken ? PALETTE.ink : rgba('#4F5D59', 0.85);
      ctx.fillText(w.w, x, y);
      if (style.mode === 'karaoke' && activeW) {
        const ww = ctx.measureText(w.w).width;
        const sweep = clamp01((tMs - w.t) / Math.max(w.d, 80));
        ctx.fillStyle = PALETTE.up;                       // v5: teal karaoke sweep
        roundRect(ctx, x - 2, y + fontSize * 0.62, (ww + 4) * easeOutQuad(sweep), 9, 4.5);
        ctx.fill();
      }
      x += ctx.measureText(w.w).width + spaceW;
    }
  });
  ctx.restore();
}

/** Chapter card — the 0.9s premium transition between sections. */
export function drawChapterCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  dur: number,
  index: number,
  title: string,
  progress: number, // overall video progress 0..1
  totalChapters = 10 // v2 (PATCH 8): dots match the real chapter count
): void {
  const p = clamp01(t / Math.min(dur, 500));
  const out = clamp01((t - (dur - 380)) / 380);
  const a = Math.min(1, p * 1.4) * (1 - easeInOutSine(out));
  ctx.save();
  ctx.globalAlpha = a;
  // light backdrop wipe
  ctx.fillStyle = rgba('#FFFFFF', 0.97);
  ctx.fillRect(0, 0, W, H);
  // v4 (audit P1-5): ghost chapter number behind the title — the vision
  // panel called the bare card “a legal disclaimer slide”; a 10%-gold serif
  // numeral gives the card scale and brand without stealing legibility
  ctx.save();
  ctx.globalAlpha = a * 0.1 * easeOutCubic(clamp01(t / 700));
  setFont(ctx, 400, 700, FONT_DISPLAY);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(String(index).padStart(2, '0'), W / 2, H / 2 + 150);
  ctx.restore();
  // gold rule grows
  const cw = 120 + 480 * easeOutCubic(p);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - cw / 2, H / 2 - 120);
  ctx.lineTo(W / 2 + cw / 2, H / 2 - 120);
  ctx.stroke();
  // chapter number — goldInk (v4, audit P0-4): 30px small text needs the
  // AA-safe gold, not the display gold
  setFont(ctx, 30, 600);
  ctx.fillStyle = PALETTE.goldInk;
  ctx.textAlign = 'center';
  ctx.fillText(`CHAPTER ${String(index).padStart(2, '0')}`, W / 2, H / 2 - 66);
  // title — v4 (audit §4.3): serif like every scene headline; one family
  // policy for scene titles kills the “brand switches voice” note
  setFont(ctx, 62, 700, FONT_DISPLAY);
  ctx.fillStyle = PALETTE.ink;
  const size = fitShrink(ctx, title, W - 400, 62);
  void size;
  ctx.fillText(title, W / 2, H / 2 + 22);
  // progress dots — v4 (audit P1-5): the active chapter dot is enlarged
  // and ringed so the row reads as navigation, not decoration
  const total = Math.max(2, totalChapters);
  const dotR = 7;
  const gap = 26;
  const startX = W / 2 - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    const filled = i / (total - 1) <= progress;
    const active = i === index - 1;
    const x = startX + i * gap;
    const y = H / 2 + 96;
    if (active) {
      ctx.beginPath();
      ctx.arc(x, y, dotR + 6, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(PALETTE.gold, 0.55);
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, active ? dotR + 3 : filled ? dotR : dotR * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = filled ? (active ? PALETTE.goldDeep : PALETTE.gold) : rgba(PALETTE.grid, 0.5);
    ctx.fill();
  }
  // v5 (audit P1-5): the host peeks in from the left edge with a signpost
  // pointing at the chapter — the card now has a guide, not just type. He
  // slides in 24px and settles; the sign board carries the chapter number
  // and an arrow chevron aimed at the title. Drawn last so he reads OVER
  // the ghost numeral, alpha tied to the card's own fade.
  {
    const slide = (1 - easeOutCubic(clamp01(t / 420))) * 24;
    const sy = H * 0.78;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(-slide, 0);
    // signpost: pole + tilted board with the chapter number + chevron
    const px = 196;
    ctx.strokeStyle = rgba(PALETTE.shadow, 0.9);
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px, sy + 6);
    ctx.lineTo(px, sy - 148);
    ctx.stroke();
    ctx.save();
    ctx.translate(px, sy - 148);
    ctx.rotate(-0.05);
    setFont(ctx, 26, 700);
    const label = `CH. ${String(index).padStart(2, '0')}`;
    const bw = ctx.measureText(label).width + 92;
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, -14, -46, bw, 56, 12);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PALETTE.gold;
    roundRect(ctx, -14, -46, bw, 56, 12);
    ctx.stroke();
    ctx.fillStyle = PALETTE.goldInk;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, -17);
    // arrow chevron pointing at the title
    ctx.strokeStyle = PALETTE.goldInk;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(bw - 62, -18);
    ctx.lineTo(bw - 42, -18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bw - 50, -27);
    ctx.lineTo(bw - 38, -18);
    ctx.lineTo(bw - 50, -9);
    ctx.stroke();
    ctx.restore();
    // the host — peeking, pointing at the sign/title
    const pose = Stickman.poseAt(t, { gesture: 'pointR', speaking: false, seed: 3 });
    drawStickmanV2(ctx, 96, sy + 58, 0.72, t, { pose, alpha: a, look: 0.9, scarf: true }, 3);
    ctx.restore();
  }
  ctx.restore();
}

function fitShrink(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  size: number
): number {
  let s = size;
  setFont(ctx, s, 700);
  while (ctx.measureText(text).width > maxW && s > 30) {
    s -= 2;
    setFont(ctx, s, 700);
  }
  return s;
}

/** Corner watermark: channel mark + episode chip. */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  channelName: string,
  alpha = 0.85
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  // small gold K mark
  ctx.translate(58, 52);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(0, 13);
  ctx.moveTo(0, 1);
  ctx.lineTo(12, -12);
  ctx.moveTo(0, 1);
  ctx.lineTo(12, 12);
  ctx.stroke();
  setFont(ctx, 24, 600); // v8.1: TYPE_FLOOR sweep (was 23)
  ctx.fillStyle = rgba('#55555F', 0.9);
  ctx.textAlign = 'left';
  ctx.fillText(channelName.toUpperCase(), 24, 8);
  ctx.restore();
  void W;
}

/** Chapter label (top-right, first seconds of each chapter). */
export function drawChapterLabel(
  ctx: CanvasRenderingContext2D,
  W: number,
  label: string,
  t: number,
  showFor = 4200
): void {
  if (t > showFor) return;
  const aIn = clamp01(t / 400);
  const aOut = 1 - clamp01((t - (showFor - 500)) / 500);
  const a = aIn * aOut;
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a * 0.9;
  setFont(ctx, 24, 600); // v8.1: TYPE_FLOOR sweep (was 22)
  const tw = ctx.measureText(label).width;
  const x = W - 96 - tw - 40;
  ctx.fillStyle = rgba('#FFFFFF', 0.9);
  roundRect(ctx, x, 44, tw + 44, 44, 22);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(PALETTE.grid, 0.55);
  roundRect(ctx, x, 44, tw + 44, 44, 22);
  ctx.stroke();
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 22, 73);
  ctx.restore();
}

/** Thin gold progress bar + chapter ticks (bottom edge). */
export function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  progress: number,
  chapterFracs: number[]
): void {
  const y = H - 8;
  ctx.save();
  ctx.fillStyle = rgba(PALETTE.muted, 0.28);
  roundRect(ctx, 0, y, W, 8, 0);
  ctx.fill();
  ctx.fillStyle = PALETTE.up;                 // v5: teal progress
  roundRect(ctx, 0, y, W * clamp01(progress), 8, 0);
  ctx.fill();
  for (const f of chapterFracs) {
    ctx.fillStyle = rgba('#FFFFFF', 0.9);
    ctx.beginPath();
    ctx.arc(f * W, y + 4, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
