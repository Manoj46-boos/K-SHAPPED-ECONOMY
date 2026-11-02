/**
 * Thumbnail generator — built exactly to the script's spec:
 * split image, rocketing chart left / empty wallet right, bold "K" on the
 * divide, "RECORD HIGH" + "STILL BROKE?" overlays, high contrast at 120px.
 */

import { PALETTE, FONT_UI, rgba, roundRect, setFont } from './theme';

export function drawThumbnail(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number
): void {
  // light premium base
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#FDFCF8');
  g.addColorStop(1, '#F1EBDC');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // ── left half: rocketing chart ──
  const lg = ctx.createLinearGradient(0, 0, W * 0.5, H);
  lg.addColorStop(0, '#F4FAF7');
  lg.addColorStop(1, '#E4F2EC');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W * 0.5, H);
  // chart grid
  ctx.strokeStyle = rgba('#0E8074', 0.14);
  ctx.lineWidth = 3;
  for (let i = 1; i <= 5; i++) {
    const y = H * (i / 6);
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(W * 0.44, y);
    ctx.stroke();
  }
  // area + rocket line
  const pts: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const x = 50 + (i / 20) * (W * 0.4);
    const t = i / 20;
    const dip = t > 0.35 && t < 0.5 ? -0.06 : 0;
    const y = H * 0.78 - Math.pow(t, 1.6) * H * 0.58 + dip * H;
    pts.push([x, y]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], H);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(pts[pts.length - 1][0], H);
  ctx.closePath();
  const ag = ctx.createLinearGradient(0, H * 0.2, 0, H);
  ag.addColorStop(0, rgba('#0E8074', 0.4));
  ag.addColorStop(1, rgba('#0E8074', 0.04));
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.strokeStyle = '#0E8074';
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  // arrowhead at the end
  const [ex, ey] = pts[pts.length - 1];
  ctx.fillStyle = '#0E8074';
  ctx.beginPath();
  ctx.moveTo(ex + 6, ey - 10);
  ctx.lineTo(ex + 44, ey + 8);
  ctx.lineTo(ex + 10, ey + 30);
  ctx.closePath();
  ctx.fill();
  // RECORD HIGH label
  ctx.save();
  ctx.translate(64, H * 0.2);
  ctx.rotate(-0.03);
  setFont(ctx, 74, 700, FONT_UI);
  ctx.fillStyle = '#0E8074';
  ctx.fillText('RECORD', 0, 0);
  ctx.fillText('HIGH', 0, 84);
  ctx.restore();

  // ── right half: empty wallet ──
  const rg = ctx.createLinearGradient(W * 0.5, 0, W, H);
  rg.addColorStop(0, '#FBF1EA');
  rg.addColorStop(1, '#F3E0D4');
  ctx.fillStyle = rg;
  ctx.fillRect(W * 0.5, 0, W * 0.5, H);
  // wallet (rounded rect, open, empty)
  const wx = W * 0.62;
  const wy = H * 0.42;
  const ww = W * 0.26;
  const wh = H * 0.34;
  ctx.fillStyle = '#B98A6A';
  roundRect(ctx, wx, wy, ww, wh, 28);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#8E6547';
  roundRect(ctx, wx, wy, ww, wh, 28);
  ctx.stroke();
  // open flap
  ctx.fillStyle = '#A97C5D';
  roundRect(ctx, wx + 12, wy - H * 0.1, ww - 24, H * 0.12, 18);
  ctx.fill();
  // empty interior
  ctx.fillStyle = '#F7EDE5';
  roundRect(ctx, wx + 20, wy + 20, ww - 40, wh - 40, 14);
  ctx.fill();
  // a single sad fly-away coin
  ctx.fillStyle = rgba('#C9A227', 0.85);
  ctx.beginPath();
  ctx.arc(wx + ww * 0.86, wy - H * 0.13, 16, 0, Math.PI * 2);
  ctx.fill();
  // crickets line
  ctx.strokeStyle = rgba('#8E6547', 0.5);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(wx + 44, wy + wh * 0.5);
  ctx.quadraticCurveTo(wx + ww * 0.5, wy + wh * 0.34, wx + ww - 44, wy + wh * 0.5);
  ctx.stroke();
  // STILL BROKE? label
  setFont(ctx, 74, 700, FONT_UI);
  ctx.fillStyle = '#D96C47';
  ctx.fillText('STILL', W * 0.58, H * 0.24);
  ctx.fillText('BROKE?', W * 0.58, H * 0.24 + 84);

  // ── the divide: giant K in white with gold outline (high contrast on both) ──
  const kx = W * 0.5;
  const ky = H * 0.5;
  const S = H * 0.3;
  // glow behind K for pop
  const kg = ctx.createRadialGradient(kx, ky, 10, kx, ky, S * 1.8);
  kg.addColorStop(0, rgba('#FFFFFF', 0.95));
  kg.addColorStop(1, rgba('#FFFFFF', 0));
  ctx.fillStyle = kg;
  ctx.fillRect(kx - S * 2, ky - S * 2, S * 4, S * 4);
  // K strokes — thick white with gold rim
  const drawStroke = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.lineCap = 'round';
    for (const [color, width] of [
      ['#A8841B', 64],
      ['#FFFFFF', 44],
    ] as [string, number][]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  };
  drawStroke(kx - 14, ky - S, kx - 14, ky + S);
  drawStroke(kx - 6, ky + S * 0.08, kx + S * 1.05, ky - S * 0.92);
  drawStroke(kx - 6, ky + S * 0.08, kx + S * 1.05, ky + S * 0.92);
}
