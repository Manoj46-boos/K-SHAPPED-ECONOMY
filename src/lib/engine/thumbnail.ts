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
import { POSES } from './stickman';
import { drawStickmanV2 } from './stickman-v2';

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
  // AUDIT-ROUND-2 (fix 5, panel round 2): the question IS the punch; the
  // number lives in the badge, ONCE, with its alarming completion.
  { punch: ['FEELING', 'BROKE?'],             badge: { big: '+20%', label: '...for who?' } },
  { punch: ['STILL', 'BROKE?'],              badge: { big: '+20%', label: 'S&P · 12 MO' } },
  { punch: ['WHY AM I', 'BROKE?'],           badge: { big: '+22%', label: 'NASDAQ · 12 MO' } },
  { punch: ['MARKET UP.', 'YOU?'],           badge: { big: '+20%', label: 'S&P · 12 MO' } },
  { punch: ['RICH MARKET.', 'BROKE YOU.'],   badge: { big: '38%',  label: '10 STOCKS' } },
  { punch: ['UP 20%.', 'BROKE ANYWAY?'],     badge: { big: '46%',  label: '7 STOCKS' } },
];

/**
 * Thumbnail generator v4 — "THE POSTER" (audit-round-2, fix 5).
 *
 * v3's scan order read backwards — number (the +20% badge), then
 * question (the punchline), then character (the chibi inside the K) —
 * and +20% appeared TWICE (punchline AND badge), the S&P sub-badge fed
 * the feed's crop, the K read as a watermark, and the figure floated with
 * no contact shadow on the orange side. The audit's prescription: "scan
 * order becomes character, question, number". v4:
 *  - CHARACTER first: the worried host LARGE on the left, standing ACROSS
 *    the teal/coral seam — one foot in each economy — with a CONTACT
 *    shadow that reads on BOTH color fields.
 *  - QUESTION loudest: "FEELING BROKE?" carries the frame at 168px.
 *  - NUMBER once, incomplete and alarming: the badge says "+20%" with
 *    the sub-line "...for who?" — the S&P label is gone; the number
 *    completes IN THE VIDEO, which is the click.
 *  - the K shrinks to a small branded tag (top-right corner mark).
 */
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

  // ── CHARACTER FIRST (fix 5): the worried host, LARGE, standing ACROSS the
  // seam — one foot on the teal field, one on the coral — his contact
  // shadow crossing both color fields. The split IS the K-shape; the man
  // standing astride it is the film. Chibi head (r 62) so the worry reads
  // at 100px feed height; hands up; brows up; mouth open.
  // ── CHARACTER FIRST (fix 5) — 100-JUDGE PANEL REPORT (fix F — SAME
  // BRAND): the generic white stick man was a stranger — "the viewer who
  // clicks meets a different character." The thumbnail now renders the
  // FILM's host with the real rig (drawStickmanV2) in the re-keyed shock
  // pose, astride the seam, waist-up staging (the legs run below the
  // canvas edge): the face carries the worry at feed size, and the
  // character matches the first frame of the video.
  {
    const fx = W * 0.52;
    const fy = H * 1.08; // pelvis below the bottom edge: waist-up framing
    const SC = 3.2;      // head ≈ 145px at 1280×720 — the worry reads at 320px
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(SC, SC);
    drawStickmanV2(ctx, 0, 0, 1, 4000, {
      pose: POSES.shock,
      talk: 0.8, jaw2x: 1.6, faceScale: 1.35,
      look: 0.15, parallax: false, scarf: true,
    }, 7);
    ctx.restore();
    // the contact shadow — astride the seam at the canvas edge
    ctx.fillStyle = 'rgba(15, 40, 34, 0.35)';
    ctx.beginPath();
    ctx.ellipse(W * 0.52, H - 6, 200, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── QUESTION LOUDEST (fix 5): the question line carries the frame —
  // solid white fill, heavy ink stroke, crop-safe, 168px down to fit.
  // The A/B family keeps its alternate wordings; the shipped variant (0)
  // is the pure question, the first thing the eye reads after the man.
  {
    // Panel round 2: the question sits top-right — clear of the figure's
    // raised right hand (x≈0.57W) and of the badge (now bottom-right). It
    // auto-fits the quadrant at up to 150px and never leaves the crop-safe
    // margin.
    const px0 = Math.round(W * 0.592);        // right of the raised hand
    const maxLineW = W - 45 - px0;
    let pSize = 150;
    setFont(ctx, pSize, 700, FONT_UI);
    const widestOf = (): number => {
      let w = 0;
      for (const l of v.punch) w = Math.max(w, ctx.measureText(l).width);
      return w;
    };
    while (widestOf() > maxLineW && pSize > 80) {
      pSize -= 4;
      setFont(ctx, pSize, 700, FONT_UI);
    }
    const strokeW = Math.max(10, Math.round(pSize * 0.085));
    ctx.save();
    ctx.translate(px0, H * 0.33);
    ctx.rotate(-0.012);
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = strokeW;
    ctx.strokeStyle = INK;
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
  }

  // ── NUMBER, ONCE — incomplete and alarming (fix 5): the badge carries
  // the number and the question it leaves hanging ("...for who?"). The
  // S&P sub-label is gone — the number completes IN the video.
  {
    setFont(ctx, 117, 700, FONT_UI);
    const bigW = ctx.measureText(v.badge.big).width;
    // fix 5: the alarming completion replaces the S&P source line
    setFont(ctx, 44, 600, FONT_UI);
    const sub = '...for who?';
    const subW = ctx.measureText(sub).width;
    const plateW = Math.max(bigW, subW) + 110;
    const plateH = 225;
    // Panel round 2: the badge moves to the BOTTOM-right — the scan order
    // ends on the number (character → question → number), and the top-right
    // quadrant belongs to the question. Bottom edge 675 keeps the 5% crop
    // margin (720·0.95 = 684).
    const bx = W - plateW - 36; // bottom-right, crop-safe
    const by = H - plateH - 45;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 40, 34, 0.42)';
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
    ctx.fillText(sub, bx + 52, by + 192);
    ctx.restore();
  }

  // ── THE K — a small branded tag (fix 5): "K shrinks to a small branded
  // tag". One crisp gold K mark, top-left corner, beside nothing — a
  // signature, not a watermark.
  {
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    const kx = 84, ky = 116, ks = 54;
    ctx.beginPath();
    ctx.moveTo(kx, ky - ks);
    ctx.lineTo(kx, ky + ks);
    ctx.moveTo(kx, ky + ks * 0.08);
    ctx.lineTo(kx + ks * 1.12, ky - ks * 0.92);
    ctx.moveTo(kx, ky + ks * 0.08);
    ctx.lineTo(kx + ks * 1.12, ky + ks * 0.92);
    ctx.stroke();
    // the one-light offset shadow — the mark declares, in the film's light
    ctx.strokeStyle = rgba(GOLDD, 0.6);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(kx - 4, ky - ks);
    ctx.lineTo(kx - 4, ky + ks);
    ctx.moveTo(kx - 4, ky + ks * 0.08);
    ctx.lineTo(kx - 4 + ks * 1.12, ky - ks * 0.92);
    ctx.moveTo(kx - 4, ky + ks * 0.08);
    ctx.lineTo(kx - 4 + ks * 1.12, ky + ks * 0.92);
    ctx.stroke();
    ctx.restore();
  }
  void DOWN;
  void GOLDD;
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
