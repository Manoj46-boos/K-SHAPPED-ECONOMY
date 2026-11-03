/**
 * On-screen text system: karaoke captions synced to word timings,
 * chapter transition cards, corner watermark, thin gold progress bar.
 */

import { clamp01, easeInOutSine, easeOutCubic, easeOutQuad } from './easing';
import { PALETTE, FONT_UI, rgba, roundRect, setFont } from './theme';

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
  const fontSize = 40;
  const maxW = Math.min(W - 520, W * 0.62); // hard cap: 62% of frame
  setFont(ctx, fontSize, 600, FONT_UI);
  const spaceW = ctx.measureText(' ').width;

  // sliding window: 6 spoken words back, fill forward to the width cap
  let winStart = 0;
  let lastSpoken = -1;
  for (let i = 0; i < words.length; i++) {
    if (tMs >= words[i].t) lastSpoken = i;
  }
  if (lastSpoken > 6) winStart = lastSpoken - 5;
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
  ctx.strokeStyle = rgba('#B9B4A6', 0.5);
  roundRect(ctx, px, py, widest + 68, totalH, 30);
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  roundRect(ctx, px + 2, py + 14, 6, totalH - 28, 3);
  ctx.fill();
  ctx.restore();

  // words — spoken = ink, upcoming = 55% ink (passes contrast), active = sweep
  ctx.save();
  ctx.textBaseline = 'middle';
  setFont(ctx, fontSize, 600, FONT_UI);
  rows.forEach((row, ri) => {
    let x = W / 2 - row.width / 2 + spaceW / 2;
    const y = py + 26 + ri * rowH + fontSize / 2;
    for (const w of row.words) {
      const spoken = tMs >= w.t;
      const activeW = spoken && tMs <= w.t + w.d + 90;
      ctx.fillStyle = spoken ? PALETTE.ink : rgba('#55555F', 0.55);
      ctx.fillText(w.w, x, y);
      if (style.mode === 'karaoke' && activeW) {
        const ww = ctx.measureText(w.w).width;
        const sweep = clamp01((tMs - w.t) / Math.max(w.d, 80));
        ctx.fillStyle = PALETTE.gold;
        roundRect(ctx, x - 2, y + fontSize * 0.62, (ww + 4) * easeOutQuad(sweep), 6, 3);
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
  ctx.fillStyle = rgba('#FDFCF8', 0.97);
  ctx.fillRect(0, 0, W, H);
  // v4 (audit P1-5): ghost chapter number behind the title — the vision
  // panel called the bare card “a legal disclaimer slide”; a 10%-gold serif
  // numeral gives the card scale and brand without stealing legibility
  ctx.save();
  ctx.globalAlpha = a * 0.1 * easeOutCubic(clamp01(t / 700));
  setFont(ctx, 400, 700, 'Georgia, "Times New Roman", serif');
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
  setFont(ctx, 62, 700, 'Georgia, "Times New Roman", serif');
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
    ctx.fillStyle = filled ? (active ? PALETTE.goldDeep : PALETTE.gold) : rgba('#B9B4A6', 0.5);
    ctx.fill();
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
  setFont(ctx, 23, 600);
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
  setFont(ctx, 22, 600);
  const tw = ctx.measureText(label).width;
  const x = W - 96 - tw - 40;
  ctx.fillStyle = rgba('#FFFFFF', 0.9);
  roundRect(ctx, x, 44, tw + 44, 44, 22);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba('#B9B4A6', 0.55);
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
  ctx.fillStyle = rgba('#B9B4A6', 0.28);
  roundRect(ctx, 0, y, W, 8, 0);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  roundRect(ctx, 0, y, W * clamp01(progress), 8, 0);
  ctx.fill();
  for (const f of chapterFracs) {
    ctx.fillStyle = rgba('#FDFCF8', 0.9);
    ctx.beginPath();
    ctx.arc(f * W, y + 4, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
