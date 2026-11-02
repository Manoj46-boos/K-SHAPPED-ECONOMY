/**
 * Thumbnail generator v2 — mobile-first, zero brown.
 *
 * v1 sins (panel verdict): the "empty wallet" prop was literally painted in
 * browns (#B98A6A / #8E6547 / #A97C5D) — a banned color family — and the
 * "RECORD HIGH / STILL BROKE?" type was solid fill, illegible at 120px feed
 * size.
 *
 * v2: diagonal mint/peach split, thick rocket chart with glow + arrow, a
 * stickman with turned-out empty pockets (reads instantly, no props), a
 * giant gold K with white rim, and outlined type — max 2 words per line,
 * right-side copy kept 5% off the edge (YouTube crop-safe).
 *
 * Rendered preview: panel report frame B-thumbnail-v2.png.
 */

import { FONT_UI, rgba, roundRect, setFont } from './theme';

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

export function drawThumbnail(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number
): void {
  const UP = '#0E8074', DOWN = '#D96C47', GOLD = '#C9A227', GOLDD = '#A8841B';
  const INK = '#26262E', IVORY = '#FDFCF8';

  // background: diagonal split — cool mint left / warm peach right
  const gl = ctx.createLinearGradient(0, 0, W * 0.55, H);
  gl.addColorStop(0, '#F4FAF7');
  gl.addColorStop(1, '#DCEFE8');
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, W * 0.52, H);
  const gr = ctx.createLinearGradient(W * 0.48, 0, W, H);
  gr.addColorStop(0, '#FDF2EA');
  gr.addColorStop(1, '#F7DCCB');
  ctx.fillStyle = gr;
  ctx.fillRect(W * 0.52, 0, W * 0.48, H);
  // white seam on the diagonal
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W * 0.52, 0); ctx.lineTo(W * 0.62, 0);
  ctx.lineTo(W * 0.56, H); ctx.lineTo(W * 0.46, H);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.restore();

  // LEFT: rocket chart (thick + glow) and a big number badge
  const pts: [number, number][] = [];
  for (let i = 0; i <= 22; i++) {
    const x = 70 + (i / 22) * (W * 0.34);
    const t = i / 22;
    const dip = t > 0.32 && t < 0.46 ? -0.05 : 0;
    const y = H * 0.80 - Math.pow(t, 1.55) * H * 0.62 + dip * H;
    pts.push([x, y]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], H);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(pts[pts.length - 1][0], H);
  ctx.closePath();
  const ag = ctx.createLinearGradient(0, H * 0.15, 0, H);
  ag.addColorStop(0, rgba(UP, 0.5));
  ag.addColorStop(1, rgba(UP, 0.03));
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(UP, 0.35); ctx.lineWidth = 30;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = UP; ctx.lineWidth = 16;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  const [ex, ey] = pts[pts.length - 1];
  ctx.fillStyle = UP;
  ctx.beginPath();
  ctx.moveTo(ex + 4, ey - 16);
  ctx.lineTo(ex + 58, ey + 6);
  ctx.lineTo(ex + 12, ey + 38);
  ctx.closePath();
  ctx.fill();
  setFont(ctx, 96, 700, FONT_UI);
  ctx.save();
  ctx.translate(84, H * 0.26);
  ctx.rotate(-0.02);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('+20%', 0, 0);
  ctx.strokeStyle = UP; ctx.lineWidth = 8;
  ctx.strokeText('+20%', 0, 0);
  ctx.restore();

  // RIGHT: stickman with turned-out empty pockets (NO brown props)
  const sx = W * 0.80, sy = H * 0.66;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(1.35, 1.35);
  ctx.fillStyle = rgba('#8C8474', 0.25);
  ctx.beginPath();
  ctx.ellipse(0, 6, 62, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  taper(ctx, 0, -140, -34, 0, 13, 11, INK);
  taper(ctx, 0, -140, 34, 0, 13, 11, INK);
  taper(ctx, 0, -140, 0, -248, 16, 19, INK);
  taper(ctx, 0, -240, -44, -176, 11, 8, INK);
  taper(ctx, 0, -240, 44, -176, 11, 8, INK);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  roundRect(ctx, -30, -156, 26, 34, 6); ctx.fill(); ctx.stroke();
  roundRect(ctx, 6, -156, 26, 34, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(-56, -120, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = IVORY;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, -292, 34, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(-12, -296, 4.6, 4.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12, -296, 4.6, 4.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-20, -308); ctx.lineTo(-6, -310); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -310); ctx.lineTo(20, -308); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, -278); ctx.quadraticCurveTo(0, -284, 8, -278); ctx.stroke();
  ctx.restore();

  // CENTER: the K — gold with white rim + glow (reads at feed size)
  const kx = W * 0.515, ky = H * 0.5, S = H * 0.30;
  const kg = ctx.createRadialGradient(kx, ky, 10, kx, ky, S * 2.1);
  kg.addColorStop(0, rgba('#FFFFFF', 0.95));
  kg.addColorStop(1, rgba('#FFFFFF', 0));
  ctx.fillStyle = kg;
  ctx.fillRect(kx - S * 2, ky - S * 2, S * 4, S * 4);
  const stroke3 = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.lineCap = 'round';
    const passes: [string, number][] = [[GOLDD, 78], ['#FFFFFF', 56], [GOLD, 44]];
    for (const [col, w] of passes) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  };
  stroke3(kx - 16, ky - S, kx - 16, ky + S);
  stroke3(kx - 8, ky + S * 0.06, kx + S * 1.06, ky - S * 0.94);
  stroke3(kx - 8, ky + S * 0.06, kx + S * 1.06, ky + S * 0.94);

  // TYPE: max 2 words per line, outlined for mobile legibility
  setFont(ctx, 108, 700, FONT_UI);
  ctx.save();
  ctx.translate(84, H * 0.50);
  ctx.rotate(-0.015);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('RECORD', 0, 0);
  ctx.fillText('HIGHS', 0, 118);
  ctx.strokeStyle = UP; ctx.lineWidth = 10;
  ctx.strokeText('RECORD', 0, 0);
  ctx.strokeText('HIGHS', 0, 118);
  ctx.restore();
  setFont(ctx, 100, 700, FONT_UI);
  ctx.textAlign = 'left';
  const rX = W * 0.665; // 5% safe margin from the right edge (YouTube crops)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('FEELING', rX, H * 0.78);
  ctx.strokeText('FEELING', rX, H * 0.78);
  ctx.fillText('BROKE?', rX, H * 0.885);
  ctx.strokeText('BROKE?', rX, H * 0.885);
}
