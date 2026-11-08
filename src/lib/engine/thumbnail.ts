/**
 * Thumbnail generator v3 — "poster logic" (report P0-3 / §4.8).
 *
 * v2 sins (panel CTR review, 4.5-5.5/10): three competing hero objects (K +
 * rocket chart + figure), the punchline white-with-outline on a PASTEL
 * gradient (mush at 320px feed size), the +20% badge teal-on-teal with no
 * plate ("effectively invisible on a phone"), the K's diagonal fusing with
 * the chart arrow into one ambiguous shape, and a 15px face that carries no
 * emotion. The panel's one-line diagnosis: "a diagram; the fix is a poster."
 *
 * v3 rebuilds from poster logic:
 *  - ONE hero object: the gold K, bigger, on a saturated DEEP-TEAL/CORAL
 *    split — high contrast from COLOR, not darkness (no-black rule kept).
 *  - ONE 3-4 word punchline, solid white fill at 132-150px with a heavy
 *    ink stroke, inside the 5% crop-safe margin, auto-sized per wording.
 *  - ONE plated number badge (white plate, teal number) bottom-left.
 *  - Emotion legible at feed size: a chibi worried figure (head 1.7×) with
 *    hands up, on the coral half.
 *  - The rocket chart is GONE (it fused with the K and read as a diagram).
 *
 * Six variants for YouTube Test & Compare (report: "ship 4-6 variants and
 * let the measured race decide"): two control wordings from v2, four new.
 */

import { PALETTE, FONT_UI, rgba, roundRect, setFont } from './theme';

/** Tapered stroke helper (thick-to-thin polygon with round caps). */
function taper(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, ex: number, ey: number,
  w0: number, w1: number, col: string
): void {
  const dx = ex - x, dy = ey - y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x + nx * w0 / 2, y + ny * w0 / 2);
  ctx.lineTo(ex + nx * w1 / 2, ey + ny * w1 / 2);
  ctx.lineTo(ex - nx * w1 / 2, ey - ny * w1 / 2);
  ctx.lineTo(x - nx * w0 / 2, y - ny * w0 / 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, w0 / 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex, ey, w1 / 2, 0, Math.PI * 2); ctx.fill();
}

export interface ThumbVariant {
  /** punchline lines (rendered top-to-bottom, left-aligned) */
  punch: string[];
  /** plated number badge */
  badge: { big: string; label: string };
}

/** The six v3 variants — A/B/C keep v2's proven wordings as controls.
 *  Panel re-review notes: badge sub-lines must stay ≤ 10 chars to read at
 *  320px feed size ("OF PROFIT GROWTH · 7 STOCKS" was mush); v5 earns its
 *  slot only with the short form. */
export const THUMB_VARIANTS: ThumbVariant[] = [
  { punch: ['FEELING', 'BROKE?'],            badge: { big: '+20%', label: 'S&P · 12 MO' } },
  { punch: ['STILL', 'BROKE?'],              badge: { big: '+20%', label: 'S&P · 12 MO' } },
  { punch: ['WHY AM I', 'BROKE?'],           badge: { big: '+22%', label: 'NASDAQ · 12 MO' } },
  { punch: ['MARKET UP.', 'YOU?'],           badge: { big: '+20%', label: 'S&P · 12 MO' } },
  { punch: ['RICH MARKET.', 'BROKE YOU.'],   badge: { big: '38%',  label: '10 STOCKS' } },
  { punch: ['UP 20%.', 'BROKE ANYWAY?'],     badge: { big: '46%',  label: '7 STOCKS' } },
];

export function drawThumbnail(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  variant: 0 | 1 | 2 | 3 | 4 | 5 = 0
): void {
  const { up: UP, down: DOWN, gold: GOLD, goldDeep: GOLDD, ink: INK } = PALETTE;
  const v = THUMB_VARIANTS[Math.min(variant, THUMB_VARIANTS.length - 1) as 0 | 1 | 2 | 3 | 4 | 5];

  // ── background: saturated deep-teal / coral diagonal split ────────────────
  // Poster contrast from COLOR, not darkness. Teal deepened one step from
  // PALETTE.up (#0B6E63 → #0A5F55) so white type carries ~6:1; coral kept
  // at PALETTE.down. Both stay in the light brand's hue families — no
  // black, no brown.
  const gl = ctx.createLinearGradient(0, 0, W * 0.6, H);
  gl.addColorStop(0, '#0C6B5F');
  gl.addColorStop(1, '#09544A');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W * 0.62, 0);
  ctx.lineTo(W * 0.50, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  const gr = ctx.createLinearGradient(W * 0.45, 0, W, H);
  gr.addColorStop(0, '#D2603A');
  gr.addColorStop(1, '#C2542E');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(W * 0.62, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(W * 0.50, H);
  ctx.closePath();
  ctx.fill();
  // soft white seam on the diagonal
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W * 0.615, -8);
  ctx.lineTo(W * 0.495, H + 8);
  ctx.stroke();
  ctx.restore();
  // quiet brand tint: faint oversized K watermark on the teal field
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W * 0.16, H * 0.72);
  ctx.lineTo(W * 0.16, H * 1.25);
  ctx.moveTo(W * 0.16, H * 0.9);
  ctx.lineTo(W * 0.42, H * 0.66);
  ctx.moveTo(W * 0.16, H * 0.9);
  ctx.lineTo(W * 0.42, H * 1.14);
  ctx.stroke();
  ctx.restore();

  // ── HERO: the gold K with white rim + glow, center-right ──────────────────
  // v9 (panel re-review): kx 0.635 → 0.615 and the figure 0.875 → 0.895 —
  // the K's lower arm tip and the figure's raised hands fused at feed size;
  // each hero now owns its half cleanly.
  const kx = W * 0.615, ky = H * 0.47, S = H * 0.335;
  const kg = ctx.createRadialGradient(kx, ky, 10, kx, ky, S * 2.2);
  kg.addColorStop(0, rgba('#FFFFFF', 0.5));
  kg.addColorStop(1, rgba('#FFFFFF', 0));
  ctx.fillStyle = kg;
  ctx.fillRect(kx - S * 2.2, ky - S * 2.2, S * 4.4, S * 4.4);
  const stroke4 = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.lineCap = 'round';
    const passes: [string, number][] = [['#FFFFFF', 112], [GOLDD, 84,], ['#FFFFFF', 56], [GOLD, 42]];
    for (const [col, w] of passes) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  };
  stroke4(kx - 14, ky - S, kx - 14, ky + S);
  stroke4(kx - 6, ky + S * 0.06, kx + S * 1.04, ky - S * 0.94);
  stroke4(kx - 6, ky + S * 0.06, kx + S * 1.04, ky + S * 0.94);

  // ── PUNCHLINE: solid white fill, heavy ink stroke, crop-safe ──────────────
  // Auto-sized: 150px down to whatever keeps the widest line inside the
  // 5% crop-safe left region (x ≤ W*0.52 — the K owns everything past it).
  const px0 = W * 0.062; // 5% + a hair
  const maxLineW = W * 0.52 - px0 - 26;
  let pSize = 150;
  setFont(ctx, pSize, 700, FONT_UI);
  const widestOf = (): number => {
    let w = 0;
    for (const l of v.punch) w = Math.max(w, ctx.measureText(l).width);
    return w;
  };
  while (widestOf() > maxLineW && pSize > 64) {
    pSize -= 3;
    setFont(ctx, pSize, 700, FONT_UI);
  }
  const strokeW = Math.max(9, Math.round(pSize * 0.085));
  ctx.save();
  ctx.translate(px0, H * 0.30);
  ctx.rotate(-0.012);
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = strokeW;
  ctx.strokeStyle = INK; // dark slate-teal ink — the stroke does the work
  v.punch.forEach((line, i) => {
    const y = i * (pSize * 1.02);
    ctx.strokeText(line, 0, y);
  });
  ctx.fillStyle = '#FFFFFF';
  v.punch.forEach((line, i) => {
    const y = i * (pSize * 1.02);
    ctx.fillText(line, 0, y);
  });
  ctx.restore();

  // ── NUMBER BADGE: white plate, teal number, bottom-left ───────────────────
  // v2's +20% was white-on-mint with no plate — invisible. A solid plate
  // makes the number the second read after the punchline.
  setFont(ctx, 78, 700, FONT_UI);
  const bigW = ctx.measureText(v.badge.big).width;
  setFont(ctx, 30, 600, FONT_UI);
  const labW = ctx.measureText(v.badge.label).width;
  const plateW = Math.max(bigW, labW) + 76;
  const plateH = 150;
  const bx = px0;
  const by = H - 46 - plateH; // bottom edge 46px above the frame edge (crop-safe)
  ctx.save();
  ctx.fillStyle = rgba('#FFFFFF', 0.28);
  roundRect(ctx, bx + 5, by + 8, plateW, plateH, 26);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, bx, by, plateW, plateH, 26);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = rgba(INK, 0.85);
  roundRect(ctx, bx, by, plateW, plateH, 26);
  ctx.stroke();
  setFont(ctx, 78, 700, FONT_UI);
  ctx.fillStyle = UP;
  ctx.textAlign = 'left';
  ctx.fillText(v.badge.big, bx + 38, by + 86);
  setFont(ctx, 30, 600, FONT_UI);
  ctx.fillStyle = INK;
  ctx.fillText(v.badge.label, bx + 38, by + 128);
  ctx.restore();

  // ── EMOTION: chibi worried figure on the coral half ───────────────────────
  // The face is the point: head at 1.7× body proportion so the worried
  // expression survives a 100px-tall feed render. Hands up — "market's up,
  // I'm not" — reads instantly even when the face doesn't.
  const fx = W * 0.895, fy = H * 0.86;
  const BODY = INK;
  ctx.save();
  ctx.translate(fx, fy);
  // ground shadow
  ctx.fillStyle = rgba('#7A2E12', 0.30);
  ctx.beginPath();
  ctx.ellipse(0, 8, 78, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  taper(ctx, 0, -128, -30, 0, 15, 12, BODY);
  taper(ctx, 0, -128, 30, 0, 15, 12, BODY);
  // torso
  taper(ctx, 0, -128, 0, -238, 19, 23, BODY);
  // arms — hands UP (the shrug)
  taper(ctx, -6, -226, -66, -286, 13, 10, BODY);
  taper(ctx, 6, -226, 66, -286, 13, 10, BODY);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = BODY;
  ctx.lineWidth = 6;
  for (const hx of [-70, 70]) {
    ctx.beginPath(); ctx.arc(hx, -292, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // head — CHIBI scale (r 66): emotion survives 100px
  const hr = 66;
  ctx.beginPath();
  ctx.arc(0, -330, hr, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = BODY;
  ctx.stroke();
  // worried brows (inner ends raised)
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-38, -352); ctx.lineTo(-14, -362); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(38, -352); ctx.lineTo(14, -362); ctx.stroke();
  // eyes — wide
  ctx.fillStyle = BODY;
  ctx.beginPath(); ctx.ellipse(-21, -336, 8.5, 10.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(21, -336, 8.5, 10.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(-18, -340, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(24, -340, 2.8, 0, Math.PI * 2); ctx.fill();
  // open-mouth worry
  ctx.fillStyle = PALETTE.down;
  ctx.beginPath();
  ctx.ellipse(0, -302, 13, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BODY;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, -302, 13, 17, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  void DOWN;
}

/**
 * A/B/C/D/E/F thumbnail generator for YouTube's Test & Compare — the v3
 * poster family. Convenience wrapper over drawThumbnail(v).
 */
export function drawThumbnailVariant(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  variant: 0 | 1 | 2 | 3 | 4 | 5 = 0
): void {
  drawThumbnail(ctx, W, H, variant);
}
