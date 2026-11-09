/**
 * On-screen text system: karaoke captions synced to word timings,
 * chapter transition cards, corner watermark, thin gold progress bar.
 */

import { clamp01, easeInOutSine, easeOutCubic, easeOutQuad } from './easing';
import { PALETTE, FONT_UI, FONT_DISPLAY, rgba, roundRect, setFont, TYPE_FLOOR } from './theme';
import { Stickman } from './stickman';
import { drawStickmanV2 } from './stickman-v2';
import { registerPill, registerFixed } from './collision';

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
  /** v9 (report P0-2): cap the pill at ONE row on host scenes, where the
   *  host figure lives in the lower third — a 2-row pill's top edge rises
   *  to y≈796 and plates the host's feet (defect D-02). Default 2. */
  maxRows?: number;
  /** v9 (report P0-7): words per sliding window (default 8; host scenes
   *  pass 6 so the single row fits the pill width cap). */
  maxWords?: number;
}

/**
 * Draw the active caption. Returns nothing; safely no-ops when inactive.
 *
 * v9 (report P0-7 + D-06): the window is now WORD-CAPPED (8 words; 6 on
 * host scenes) and breaks rows on CLAUSE boundaries instead of slicing by
 * pixel width — the old 2-row-then-drop window silently ate the tail of
 * long sentences ("because most of the…" read as a render bug on 5 of 6
 * audited Shorts frames). A window that starts mid-sentence now carries a
 * leading ellipsis so continuation reads as karaoke windowing, never as a
 * truncated render.
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
  const maxRows = Math.max(1, Math.min(2, style.maxRows ?? 2));
  const maxWords = Math.max(3, style.maxWords ?? 8);
  // v8: 40→46px, 600→700 weight. The vision panel measured the caption as
  // the smallest reading text on a phone in landscape — the majority view
  // for finance explainers. 46px/1080 = 4.26% of frame height, inside
  // YouTube's own caption register; the extra weight survives the platform
  // transcode at 480p.
  const fontSize = 46;
  const maxW = Math.min(W - 460, W * 0.66); // hard cap: 66% of frame
  setFont(ctx, fontSize, 700, FONT_UI);
  const spaceW = ctx.measureText(' ').width;

  // spoken position
  let lastSpoken = -1;
  for (let i = 0; i < words.length; i++) {
    if (tMs >= words[i].t) lastSpoken = i;
  }

  // ── v9 window: word-capped, sliding, 2 words of spoken context back ──
  const len = words.length;
  let winStart = len <= maxWords ? 0 : Math.max(0, Math.min(lastSpoken - 2, len - maxWords));
  let winEnd = Math.min(len, winStart + maxWords);
  // never strand a fully-spoken window behind (early window keeps moving)
  if (lastSpoken >= 0 && winEnd <= lastSpoken) {
    winStart = Math.max(0, lastSpoken - 1);
    winEnd = Math.min(len, winStart + maxWords);
  }
  const continued = winStart > 0;
  const ell = continued ? '…' : '';
  const ellW = continued ? ctx.measureText(ell).width + spaceW * 0.5 : 0;
  // PANEL-10 (C-01, completes P0-7): the leading ellipsis shipped alone — a
  // window that ENDS mid-sentence ("…crossing 30,000 for the first") still
  // read as a truncated render on every paused frame. A window whose last
  // word is not the caption line's last word now carries a trailing ellipsis
  // too, so a paused frame reads as karaoke windowing at BOTH edges.
  const trails = winEnd < len;
  const trl = trails ? '…' : '';
  const trlW = trails ? ctx.measureText(trl).width + spaceW * 0.5 : 0;
  let winWords = words.slice(winStart, winEnd);

  const measure = (ws: CaptionWord[]): number =>
    ws.reduce((n, wd) => n + ctx.measureText(wd.w).width + spaceW, 0) - (ws.length ? spaceW : 0);

  // ── rows: break on clause boundaries near the width midpoint ──
  let rows: CaptionWord[][] = [];
  if (maxRows === 1) {
    // host scenes: one row — keep the spoken words, drop unspoken overflow
    while (winWords.length && measure(winWords) + ellW + trlW > maxW && winWords.length > Math.min(3, lastSpoken - winStart + 1)) {
      winWords = winWords.slice(0, -1);
    }
    if (winWords.length) rows = [winWords];
  } else {
    const total = measure(winWords);
    if (total + ellW + trlW <= maxW) {
      rows = [winWords];
    } else {
      // candidate breaks: after clause-ending punctuation
      const breaks: number[] = [];
      winWords.forEach((wd, i) => {
        if (i < winWords.length - 1 && /[,;:.!?—–”)%]$/.test(wd.w)) breaks.push(i + 1);
      });
      let best = -1;
      let bestScore = Infinity;
      for (const b of breaks) {
        const w1 = measure(winWords.slice(0, b));
        const w2 = total - w1 - spaceW;
        // PANEL-10: row 1 of a 2-row split never carries the trailing mark
        // (it continues INSIDE the same pill), so only row 0's ellW counts
        // in the break fit; row 1 needs room for its own trlW.
        if (w1 + ellW <= maxW && w2 + trlW <= maxW) {
          const score = Math.abs(w1 - total / 2);
          if (score < bestScore) { bestScore = score; best = b; }
        }
      }
      if (best > 0) {
        rows = [winWords.slice(0, best), winWords.slice(best)];
      } else {
        // width fallback (the v2 greedy break, now with a graceful tail drop)
        const r0: CaptionWord[] = [];
        const r1: CaptionWord[] = [];
        let rw = ellW;
        let cur = 0;
        for (const wd of winWords) {
          const ww = ctx.measureText(wd.w).width;
          if (rw + ww > maxW && (cur === 0 ? r0.length : r1.length) > 0) {
            if (cur === 1) break;
            cur = 1;
          }
          (cur === 0 ? r0 : r1).push(wd);
          rw = (cur === 0 ? measure(r0) : measure(r1)) + (cur === 0 ? ellW : 0);
        }
        rows = [r0, r1].filter((r) => r.length);
      }
    }
  }
  if (!rows.length) return;

  const rowH = fontSize + 22;
  const totalH = rows.length * rowH + 24;
  const baseY = style.baseY ?? H - 128; // clear of the 8px progress bar + safe margin
  // PANEL-10: first row carries the leading mark, last row the trailing one
  // (a single row can carry both).
  const widest = Math.max(
    ...rows.map((r, i) => measure(r) + (i === 0 ? ellW : 0) + (i === rows.length - 1 ? trlW : 0))
  );

  // pill — fully opaque plate (scene text under it must occlude cleanly,
  // not ghost through), one hairline border, gold brand tab on the left
  // v9 (report P0-1): the pill rect feeds the collision guard so the harness
  // can assert scene content never sits under it.
  // v10 (panel TYPE-3): de-SaaS'd — radius 30→18 (broadcast plate, not app
  // bubble), a whisper drop shadow so the plate lifts off the scene, and
  // the teal tab becomes a gold-anchored two-tone mark (gold base + teal
  // active tip) that ties to the gold karaoke sweep.
  registerPill(W / 2 - widest / 2 - 34, baseY - totalH + 4, widest + 68, totalH);
  ctx.save();
  const px = W / 2 - widest / 2 - 34;
  const py = baseY - totalH + 4;
  ctx.globalAlpha = 1;
  ctx.fillStyle = rgba(PALETTE.shadow, 0.06);
  roundRect(ctx, px + 1, py + 4, widest + 68, totalH, 18);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, px, py, widest + 68, totalH, 18);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba('#9FB4AE', 0.55);
  roundRect(ctx, px, py, widest + 68, totalH, 18);
  ctx.stroke();
  // the voice mark — gold base bar + teal active tip
  ctx.fillStyle = PALETTE.gold;
  roundRect(ctx, px + 3, py + 24, 7, Math.max(10, totalH - 48), 3.5);
  ctx.fill();
  ctx.fillStyle = PALETTE.up;
  roundRect(ctx, px + 3, py + 24, 7, Math.max(10, (totalH - 48) * 0.42), 3.5);
  ctx.fill();
  ctx.restore();

  // words — spoken = ink, upcoming = 85% ink (PANEL-9 R1), active = sweep;
  // v9: a leading ellipsis marks continuation windows (P0-7);
  // PANEL-10: a trailing ellipsis marks the sentence continuing past this
  // window (completes P0-7 — both edges of a paused frame now read as
  // windowing, never as a truncated render).
  ctx.save();
  ctx.textBaseline = 'middle';
  setFont(ctx, fontSize, 700, FONT_UI);
  rows.forEach((row, ri) => {
    const last = ri === rows.length - 1;
    const rowW = measure(row) + (ri === 0 ? ellW : 0) + (last ? trlW : 0);
    let x = W / 2 - rowW / 2;
    const y = py + 22 + ri * rowH + fontSize / 2;
    if (ri === 0 && continued) {
      ctx.fillStyle = rgba(PALETTE.inkFaint, 0.9);
      ctx.textAlign = 'left';
      ctx.fillText(ell, x, y);
      x += ellW;
    }
    for (const w of row) {
      const spoken = tMs >= w.t;
      const activeW = spoken && tMs <= w.t + w.d + 90;
      // PANEL-9 R1: 0.85 blends to ≈4.8:1 on white (WCAG AA) for pre-read
      // text; the spoken state stays ink at ≈9.6:1.
      ctx.fillStyle = spoken ? PALETTE.ink : rgba('#4F5D59', 0.85);
      ctx.fillText(w.w, x, y);
      if (style.mode === 'karaoke' && activeW) {
        const ww = ctx.measureText(w.w).width;
        const sweep = clamp01((tMs - w.t) / Math.max(w.d, 80));
        ctx.fillStyle = PALETTE.up;                       // v5: teal karaoke sweep
        roundRect(ctx, x - 2, y + fontSize * 0.6, (ww + 4) * easeOutQuad(sweep), 8, 4);
        ctx.fill();
      }
      x += ctx.measureText(w.w).width + spaceW;
    }
    // PANEL-10 (C-01): trailing ellipsis on the LAST row when the sentence
    // continues past this window — the paused-frame twin of the leading mark.
    if (last && trails) {
      ctx.fillStyle = rgba(PALETTE.inkFaint, 0.9);
      ctx.textAlign = 'left';
      ctx.fillText(trl, x + spaceW * 0.5, y);
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
  // v10 (panel TYPE-5): dots became a RAIL — bigger dots (9px), a hairline
  // connector between them, and the traveled span in gold. "Tiny low-
  // contrast dots, nearly invisible on a phone" was the panel's read;
  // a connected rail reads as progress even when the dots themselves blur.
  const total = Math.max(2, totalChapters);
  const dotR = 9;
  const gap = 32;
  const startX = W / 2 - ((total - 1) * gap) / 2;
  const dotY = H / 2 + 96;
  // connector rail — the traveled span in gold, the rest in grid
  if (total > 1) {
    ctx.strokeStyle = rgba(PALETTE.grid, 0.55);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(startX, dotY);
    ctx.lineTo(startX + (total - 1) * gap, dotY);
    ctx.stroke();
    const activeX = startX + (index - 1) * gap;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(startX, dotY);
    ctx.lineTo(activeX, dotY);
    ctx.stroke();
  }
  for (let i = 0; i < total; i++) {
    const filled = i / (total - 1) <= progress;
    const active = i === index - 1;
    const x = startX + i * gap;
    if (active) {
      ctx.beginPath();
      ctx.arc(x, dotY, dotR + 6, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(PALETTE.gold, 0.65);
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, dotY, active ? dotR + 3 : filled ? dotR : dotR * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = filled ? (active ? PALETTE.goldDeep : PALETTE.gold) : rgba(PALETTE.grid, 0.6);
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
  setFont(ctx, TYPE_FLOOR, 600); // v9 (D-07): TYPE_FLOOR 24→28, now enforced
  ctx.fillStyle = rgba(PALETTE.inkSoft, 0.9); // v9 (D-08): was hand-hexed #55555F — the v8 "no hand-hexed neutrals" rule applies here too
  ctx.textAlign = 'left';
  const wn = channelName.toUpperCase();
  ctx.fillText(wn, 24, 8);
  // measure while the watermark face is still active (after restore the
  // font is whatever the caller last set — PANEL-10 caught this)
  const tw = ctx.measureText(wn).width;
  ctx.restore();
  // PANEL-10 (guard v2): the watermark is FIXED furniture — it never rides
  // the camera, so scene content that the camera lifts or pushes into its
  // band (the fundSplit title under the ch6 rise did exactly that) is a
  // plating defect the pill-only guard could not see. Measured band: K mark
  // x 46..75, y 39..65; caps-height text from x≈82 (translate 58+24).
  registerFixed('watermark', 40, 30, Math.max(240, 92 + tw), 46);
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
  setFont(ctx, TYPE_FLOOR, 600); // v9 (D-07): TYPE_FLOOR 24→28
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
