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
}

/** Draw the active caption. Returns nothing; safely no-ops when inactive. */
export function drawCaptions(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tMs: number,
  lines: CaptionLine[],
  style: CaptionStyle
): void {
  if (style.mode === 'off' || !lines.length) return;
  // find active line (with 250ms tail grace)
  let active: CaptionLine | null = null;
  for (const l of lines) {
    if (tMs >= l.start - 120 && tMs <= l.end + 260) active = l;
  }
  if (!active) return;

  const words = active.words;
  const fontSize = 42;
  const maxW = W - 520;
  setFont(ctx, fontSize, 600, FONT_UI);
  const spaceW = ctx.measureText(' ').width;
  // Sliding window: for long sentences, show the words around the currently
  // spoken one (a few spoken words back + all that fit in two rows ahead).
  let winStart = 0;
  let lastSpoken = -1;
  for (let i = 0; i < words.length; i++) {
    if (tMs >= words[i].t) lastSpoken = i;
  }
  if (lastSpoken > 8) winStart = lastSpoken - 6;
  const winWords = words.slice(winStart);
  const rows: { words: (CaptionWord | null)[]; width: number }[] = [{ words: [], width: 0 }];
  let current = 0;
  for (const w of winWords) {
    const ww = ctx.measureText(w.w).width;
    if (rows[current].width + ww > maxW && rows[current].words.length > 0) {
      rows.push({ words: [], width: 0 });
      current++;
      if (rows.length > 2) break;
    }
    rows[current].words.push(w);
    rows[current].width += ww + spaceW;
  }
  const totalH = rows.length * (fontSize + 18) + 40;
  const baseY = H - 132;
  const widest = Math.max(...rows.map((r) => r.width));

  // pill background
  ctx.save();
  const px = W / 2 - widest / 2 - 34;
  const py = baseY - totalH + 6;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = rgba('#FFFFFF', 0.94);
  roundRect(ctx, px, py, widest + 68, totalH, 26);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba('#B9B4A6', 0.5);
  roundRect(ctx, px, py, widest + 68, totalH, 26);
  ctx.stroke();
  ctx.restore();

  // words
  ctx.save();
  ctx.textBaseline = 'middle';
  setFont(ctx, fontSize, 600, FONT_UI);
  rows.forEach((row, ri) => {
    let x = W / 2 - row.width / 2 + spaceW / 2;
    const y = py + 30 + ri * (fontSize + 18) + fontSize / 2;
    for (const w of row.words) {
      if (!w) continue;
      const spoken = tMs >= w.t;
      const activeW = tMs >= w.t && tMs <= w.t + w.d + 90;
      ctx.fillStyle = spoken ? PALETTE.ink : rgba('#55555F', 0.42);
      if (style.mode === 'karaoke' && activeW) {
        ctx.fillStyle = PALETTE.ink;
        ctx.fillText(w.w, x, y);
        const ww = ctx.measureText(w.w).width;
        const sweep = clamp01((tMs - w.t) / Math.max(w.d, 80));
        ctx.fillStyle = PALETTE.gold;
        roundRect(ctx, x - 2, y + fontSize * 0.62, (ww + 4) * easeOutQuad(sweep), 6, 3);
        ctx.fill();
      } else {
        ctx.fillText(w.w, x, y);
      }
      x += ctx.measureText(w.w).width + spaceW;
    }
  });
  ctx.restore();
}

/** Chapter card — the 1.2s premium transition between sections. */
export function drawChapterCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  dur: number,
  index: number,
  title: string,
  progress: number // overall video progress 0..1
): void {
  const p = clamp01(t / Math.min(dur, 500));
  const out = clamp01((t - (dur - 380)) / 380);
  const a = Math.min(1, p * 1.4) * (1 - easeInOutSine(out));
  ctx.save();
  ctx.globalAlpha = a;
  // light backdrop wipe
  ctx.fillStyle = rgba('#FDFCF8', 0.97);
  ctx.fillRect(0, 0, W, H);
  // gold rule grows
  const cw = 120 + 480 * easeOutCubic(p);
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - cw / 2, H / 2 - 120);
  ctx.lineTo(W / 2 + cw / 2, H / 2 - 120);
  ctx.stroke();
  // chapter number
  setFont(ctx, 30, 600);
  ctx.fillStyle = PALETTE.goldDeep;
  ctx.textAlign = 'center';
  ctx.fillText(`CHAPTER ${String(index).padStart(2, '0')}`, W / 2, H / 2 - 66);
  // title
  setFont(ctx, 62, 700);
  ctx.fillStyle = PALETTE.ink;
  const size = fitShrink(ctx, title, W - 400, 62);
  void size;
  ctx.fillText(title, W / 2, H / 2 + 22);
  // progress dots
  const total = 10;
  const dotR = 7;
  const gap = 26;
  const startX = W / 2 - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    const filled = i / (total - 1) <= progress;
    ctx.beginPath();
    ctx.arc(startX + i * gap, H / 2 + 96, filled ? dotR : dotR * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = filled ? PALETTE.gold : rgba('#B9B4A6', 0.5);
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
