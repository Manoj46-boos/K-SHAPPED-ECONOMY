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
 *  slot only with the short form.
 *  AUDIT-2 / §10.5 (report Phase 4): variant 0 becomes the CONTRADICTION
 *  PAIR the panel asked to bake in — "MARKET +20%. FEELING BROKE?" — the
 *  hook that survives 320px because each line is 3 words. */
export const THUMB_VARIANTS: ThumbVariant[] = [
  { punch: ['MARKET +20%.', 'FEELING BROKE?'],  badge: { big: '+20%', label: 'S&P · 12 MO' } },
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

  // ── HERO: the gold K at 60% with the stick man CRUSHED INSIDE ─────────────
  // AUDIT-2 / §10.5 (report Phase 4 — the panel's surgical instruction):
  // kill-or-shrink the K to 60% (S H*0.335 → H*0.20), put the stick man
  // INSIDE it (crushed between the strokes is a joke AND a hook), promote
  // the +20% badge to top-right at 1.5×, and bake the contradiction into
  // the headline. One hero object, one joke, one number — the poster reads
  // at 320px or it does not exist.
  const kx = W * 0.55, ky = H * 0.54, S = H * 0.20;
  const kg = ctx.createRadialGradient(kx, ky, 10, kx, ky, S * 2.4);
  kg.addColorStop(0, rgba('#FFFFFF', 0.5));
  kg.addColorStop(1, rgba('#FFFFFF', 0));
  ctx.fillStyle = kg;
  ctx.fillRect(kx - S * 2.4, ky - S * 2.4, S * 4.8, S * 4.8);
  const stroke4 = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.lineCap = 'round';
    const passes: [string, number][] = [['#FFFFFF', 70], [GOLDD, 52], ['#FFFFFF', 34], [GOLD, 25]];
    for (const [col, w] of passes) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  };
  stroke4(kx - 9, ky - S, kx - 9, ky + S);
  stroke4(kx - 4, ky + S * 0.06, kx + S * 1.04, ky - S * 0.94);
  stroke4(kx - 4, ky + S * 0.06, kx + S * 1.04, ky + S * 0.94);

  // ── PUNCHLINE: solid white fill, heavy ink stroke, crop-safe ──────────────
  // Auto-sized: 160px down to whatever keeps the widest line inside the
  // left region (x ≤ W*0.56 — the 60%-size K owns only the far right now).
  const px0 = W * 0.062; // 5% + a hair
  const maxLineW = W * 0.58 - px0 - 26;
  let pSize = 160;
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

  // ── NUMBER BADGE: white plate, teal number — TOP-RIGHT at 1.5× ───────────
  // AUDIT-2 / §10.5 (report Phase 4): the panel's instruction — promote the
  // +20% badge to the top-right corner at 1.5× its old size (78 → 117px
  // numeral on a 225px plate). It was bottom-left at a scale that died at
  // 320px; the second read of the poster is now the FIRST thing the feed
  // crop keeps. Right-aligned 36px inside the crop-safe margin, clear of
  // the K's arm tips by construction.
  setFont(ctx, 117, 700, FONT_UI);
  const bigW = ctx.measureText(v.badge.big).width;
  setFont(ctx, 44, 600, FONT_UI);
  const labW = ctx.measureText(v.badge.label).width;
  const plateW = Math.max(bigW, labW) + 110;
  const plateH = 225;
  const bx = W - plateW - 36; // top-right, crop-safe
  const by = 36;
  ctx.save();
  ctx.fillStyle = rgba('#FFFFFF', 0.28);
  roundRect(ctx, bx + 7, by + 11, plateW, plateH, 38);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, bx, by, plateW, plateH, 38);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = rgba(INK, 0.85);
  roundRect(ctx, bx, by, plateW, plateH, 38);
  ctx.stroke();
  setFont(ctx, 117, 700, FONT_UI);
  ctx.fillStyle = UP;
  ctx.textAlign = 'left';
  ctx.fillText(v.badge.big, bx + 52, by + 128);
  setFont(ctx, 44, 600, FONT_UI);
  ctx.fillStyle = INK;
  ctx.fillText(v.badge.label, bx + 52, by + 192);
  ctx.restore();

  // ── EMOTION: the stick man CRUSHED INSIDE the K ──────────────────────
  // AUDIT-2 / §10.5 (report Phase 4): "put the stick man inside it (crushed
  // between the strokes is a joke and a hook)". The chibi worried figure
  // moves INTO the letter's counter — hands up against the strokes, market
  // rising around him, wallet not. Head stays CHIBI (r 66 at 0.56 scale) so
  // the worry reads at 100px feed height; the K's 60% size makes room for
  // exactly this joke.
  const fx = kx + 68, fy = ky + 118;
  const CHIBI = 0.56;
  const BODY = INK;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.scale(CHIBI, CHIBI);
  // ground shadow — neutral slate (the figure stands in the K's counter
  // on the teal field, not on the coral half)
  ctx.fillStyle = rgba('#1F3831', 0.30);
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
