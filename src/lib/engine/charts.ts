/**
 * Animated data visuals — line charts with draw-on + glow head, pie/donut sweeps,
 * comparison bars with overshoot, dot grids, gauges, big counters.
 * All light-theme, all deterministic functions of (t, p).
 */

import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, easeOutQuad, lerp } from './easing';
import { PALETTE, TONE, card, chip, rgba, roundRect, setFont, fitText } from './theme';

export interface Pt {
  x: number;
  y: number;
}

export interface SeriesSpec {
  name: string;
  tone?: string;
  points: [number, number][];
}

export interface Annotation {
  at: number;
  series?: number;
  label: string;
  tone?: string;
  dy?: number;
}

export interface LineChartOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  series: SeriesSpec[];
  annotations?: Annotation[];
  /** 0..1 draw-on progress */
  p: number;
  t: number;
  yFormat?: 'ndx' | 'eci' | 'index' | 'idx100' | 'pct';
  band?: { from: number; to: number; label: string };
  peakBand?: { from: number; to: number; label: string };
  showYAxis?: boolean;
  gridLines?: number;
  lineWidth?: number;
  /** stop progress at a specific x-fraction (for phase highlighting) */
  revealFrac?: number;
  emphasizeLast?: boolean;
}

function yBounds(opts: LineChartOpts): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const s of opts.series) {
    for (const [, v] of s.points) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (opts.band) {
    min = Math.min(min, opts.band.from);
    max = Math.max(max, opts.band.to);
  }
  const pad = (max - min) * 0.18 || 1;
  return [min - pad, max + pad];
}

export function lineChart(ctx: CanvasRenderingContext2D, opts: LineChartOpts): void {
  const {
    x, y, w, h, series, p, t, yFormat = 'index',
    gridLines = 4, lineWidth = 5.5, showYAxis = true,
  } = opts;
  const [yMin, yMax] = yBounds(opts);

  // grid + y labels
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= gridLines; i++) {
    const gy = y + (h * i) / gridLines;
    const val = yMax - ((yMax - yMin) * i) / gridLines;
    ctx.strokeStyle = rgba('#B9B4A6', 0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash(i === gridLines ? [] : [6, 8]);
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
    ctx.setLineDash([]);
    if (showYAxis) {
      setFont(ctx, 22, 400);
      ctx.fillStyle = PALETTE.inkFaint;
      const label =
        yFormat === 'ndx' ? Math.round(val / 100) / 10 + 'k'
        : yFormat === 'eci' ? Math.round(val).toString()
        : yFormat === 'pct' ? val.toFixed(1) + '%'
        : Math.round(val).toString();
      ctx.fillText(label, x - 14, gy);
    }
  }

  // context band (e.g. "typical range")
  if (opts.band) {
    const by1 = y + h - ((opts.band.to - yMin) / (yMax - yMin)) * h;
    const by2 = y + h - ((opts.band.from - yMin) / (yMax - yMin)) * h;
    ctx.fillStyle = rgba(PALETTE.gold, 0.10);
    roundRect(ctx, x, Math.min(by1, by2), w, Math.abs(by2 - by1), 14);
    ctx.fill();
    setFont(ctx, 21, 600);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText(opts.band.label, x + 16, Math.min(by1, by2) + 24);
  }

  // peak band
  if (opts.peakBand) {
    const all = series[0].points;
    const xFrac0 = opts.peakBand.from / all[all.length - 1][0];
    const xFrac1 = opts.peakBand.to / all[all.length - 1][0];
    const bx = x + xFrac0 * w;
    const bw = (xFrac1 - xFrac0) * w;
    ctx.fillStyle = rgba(PALETTE.gold, 0.14);
    roundRect(ctx, bx, y, bw, h, 12);
    ctx.fill();
    ctx.strokeStyle = rgba(PALETTE.gold, 0.35);
    ctx.lineWidth = 2;
    roundRect(ctx, bx, y, bw, h, 12);
    ctx.stroke();
    ctx.save();
    ctx.translate(bx + bw / 2, y + h - 14);
    setFont(ctx, 20, 600);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText(opts.peakBand.label, 0, 0);
    ctx.restore();
  }

  const reveal = clamp01((opts.revealFrac ?? 1) * p);

  // area under first series
  const s0 = series[0];
  const tone0 = TONE(s0.tone).main;
  if (series.length === 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w * reveal, h);
    ctx.clip();
    const pts0 = toPx(s0, x, y, w, h, yMin, yMax);
    ctx.beginPath();
    ctx.moveTo(pts0[0].x, y + h);
    for (const pt of pts0) ctx.lineTo(pt.x, pt.y);
    ctx.lineTo(pts0[pts0.length - 1].x, y + h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(tone0, 0.18));
    g.addColorStop(1, rgba(tone0, 0.02));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  // series lines
  series.forEach((s, si) => {
    const tone = TONE(s.tone).main;
    const pts = toPx(s, x, y, w, h, yMin, yMax);
    const nVisible = Math.max(2, Math.floor(pts.length * reveal));
    const vis = pts.slice(0, nVisible);
    // glow underlay
    ctx.strokeStyle = rgba(tone, 0.16);
    ctx.lineWidth = lineWidth * 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(ctx, vis);
    // main line
    ctx.strokeStyle = tone;
    ctx.lineWidth = lineWidth;
    strokePath(ctx, vis);
    // head glow while drawing
    if (reveal < 0.999 && vis.length > 1) {
      const head = vis[vis.length - 1];
      const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 26);
      g.addColorStop(0, rgba(tone, 0.55));
      g.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(head.x, head.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (reveal >= 0.999 && opts.emphasizeLast !== false) {
      const last = vis[vis.length - 1];
      const pulse = 0.5 + 0.5 * Math.sin(t / 350);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(last.x, last.y, 9 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
    void si;
  });

  // annotations
  if (opts.annotations) {
    opts.annotations.forEach((a, i) => {
      const s = opts.series[a.series ?? 0];
      const app = clamp01((p - 0.55 - i * 0.08) / 0.3);
      if (app <= 0) return;
      const [ax, av] = atX(s.points, a.at);
      const px = x + (ax / s.points[s.points.length - 1][0]) * w;
      const py = y + h - ((av - yMin) / (yMax - yMin)) * h;
      const tone = TONE(a.tone).main;
      const rise = (1 - easeOutCubic(app)) * 18;
      ctx.save();
      ctx.globalAlpha = app;
      // connector
      ctx.strokeStyle = rgba(tone, 0.75);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + (a.dy ?? 40) * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();
      // label pill
      setFont(ctx, 23, 600);
      ctx.textAlign = 'center';
      const tw = ctx.measureText(a.label).width;
      const ly = py + (a.dy ?? 40) - rise;
      const lx = Math.min(Math.max(px, x + tw / 2 + 18), x + w - tw / 2 - 18);
      ctx.fillStyle = rgba('#8C8474', 0.10);
      roundRect(ctx, lx - tw / 2 - 16 + 1, ly - 34 + 3, tw + 32, 46, 23);
      ctx.fill();
      ctx.fillStyle = '#fff';
      roundRect(ctx, lx - tw / 2 - 16, ly - 34, tw + 32, 46, 23);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(tone, 0.55);
      roundRect(ctx, lx - tw / 2 - 16, ly - 34, tw + 32, 46, 23);
      ctx.stroke();
      ctx.fillStyle = tone;
      ctx.fillText(a.label, lx, ly - 4);
      ctx.restore();
    });
  }
  ctx.restore();
}

function toPx(
  s: SeriesSpec,
  x: number,
  y: number,
  w: number,
  h: number,
  yMin: number,
  yMax: number
): Pt[] {
  const lastX = s.points[s.points.length - 1][0];
  return s.points.map(([mx, mv]) => ({
    x: x + (mx / lastX) * w,
    y: y + h - ((mv - yMin) / (yMax - yMin)) * h,
  }));
}

function atX(points: [number, number][], at: number): [number, number] {
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i][0] <= at && points[i + 1][0] >= at) {
      const f = (at - points[i][0]) / (points[i + 1][0] - points[i][0]);
      return [at, lerp(points[i][1], points[i + 1][1], f)];
    }
  }
  return points[points.length - 1];
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i].x + pts[i + 1].x) / 2;
    const yc = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  ctx.quadraticCurveTo(prev.x + (last.x - prev.x) * 0.25, prev.y + (last.y - prev.y) * 0.25, last.x, last.y);
  ctx.stroke();
}

// ── Pie / donut ──────────────────────────────────────────────────────────────
export function pieChart(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    r: number;
    slices: { label: string; value: number; tone?: string }[];
    p: number;
    t: number;
    donut?: boolean;
    centerBig?: string;
  }
): void {
  const { cx, cy, r, slices, p, t } = opts;
  const total = slices.reduce((n, s) => n + s.value, 0);
  const sweep = easeInOutCubic(clamp01(p / 0.6)) * Math.PI * 2;
  let a0 = -Math.PI / 2;
  const gap = 0.028;
  slices.forEach((s, i) => {
    const frac = s.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const drawA1 = Math.min(a1, a0 + frac * sweep);
    const appeared = clamp01((p - 0.08 * i) / 0.4);
    if (appeared > 0 && drawA1 > a0 + 0.001) {
      const tone = TONE(s.tone).main;
      const isHi = !!s.tone && s.tone !== 'muted';
      const pop = 1 + (isHi ? easeOutBack(appeared) * 0.028 : 0);
      const rr = r * pop * (0.94 + 0.06 * easeOutQuad(appeared));
      ctx.save();
      ctx.fillStyle = isHi ? tone : rgba('#C8C2B2', 0.5);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rr, a0 + gap, drawA1 - gap);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    a0 = a1;
  });
  if (opts.donut) {
    ctx.fillStyle = PALETTE.bgTop;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.cardBorder;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (opts.centerBig && p > 0.55) {
    const ap = clamp01((p - 0.55) / 0.3);
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setFont(ctx, Math.round(r * 0.52), 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(opts.centerBig, cx, cy - 6);
    setFont(ctx, Math.round(r * 0.13), 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('of the whole', cx, cy + r * 0.26);
    ctx.restore();
  }
  void t;
}

// ── Comparison bars ──────────────────────────────────────────────────────────
export function barRow(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    rowH: number;
    label: string;
    value: number;
    maxV: number;
    p: number;
    tone?: string;
    tag?: string;
    suffix?: string;
  }
): number {
  const { x, y, w, rowH, label, value, maxV, p, tone = 'up', suffix = '%' } = opts;
  const growE = easeOutQuad(clamp01(p / 0.55));
  const overshoot = easeOutBack(clamp01(p / 0.7));
  const bw = Math.max(6, (value / maxV) * w * growE * (0.94 + 0.06 * overshoot));
  const c = TONE(tone).main;
  ctx.save();
  // label
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 27, 600);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y + rowH * 0.5 - 14);
  // bar track
  const by = y + rowH * 0.5 - 2;
  ctx.fillStyle = rgba('#C8C2B2', 0.25);
  roundRect(ctx, x, by, w, 30, 15);
  ctx.fill();
  // value bar
  const g = ctx.createLinearGradient(x, 0, x + bw, 0);
  g.addColorStop(0, rgba(c, 0.78));
  g.addColorStop(1, c);
  ctx.fillStyle = g;
  roundRect(ctx, x, by, Math.max(30, bw), 30, 15);
  ctx.fill();
  // value text
  const isGold = tone === 'gold';
  setFont(ctx, 34, 700);
  ctx.fillStyle = isGold ? PALETTE.goldDeep : c;
  ctx.textAlign = 'left';
  ctx.fillText(`+${value}${suffix}`, x + Math.max(30, bw) + 18, by + 25);
  // optional tag chip
  if (opts.tag) {
    const ap = clamp01((p - 0.5) / 0.4);
    if (ap > 0) {
      setFont(ctx, 21, 600);
      const tw = ctx.measureText(opts.tag).width;
      const tagX = x + Math.max(30, bw) + 18;
      ctx.globalAlpha = ap;
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, tagX + 108, by + 2, tw + 26, 28, 14);
      ctx.fill();
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.fillText(opts.tag, tagX + 121, by + 22);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  return rowH;
}

// ── Dot grid (500 dots, 10 highlighted) ─────────────────────────────────────
export function dotGrid(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    total: number;
    highlight: number;
    p: number;
    t: number;
  }
): void {
  const { x, y, w, h, total, highlight, p, t } = opts;
  const cols = 25;
  const rows = Math.ceil(total / cols);
  const cw = w / cols;
  const chh = h / rows;
  const dotR = Math.min(cw, chh) * 0.3;
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const idx = row * cols + col;
    const appear = clamp01((p * total * 1.35 - idx) / 12);
    if (appear <= 0) continue;
    const cx = x + col * cw + cw / 2;
    const cy = y + row * chh + chh / 2;
    const isHi = idx < highlight;
    const pop = 1 + Math.sin(appear * Math.PI) * 0.6;
    const pulse = isHi ? 1 + 0.18 * Math.sin(t / 300 + idx * 1.7) : 1;
    ctx.fillStyle = isHi ? PALETTE.gold : rgba('#B9B4A6', 0.55);
    ctx.beginPath();
    ctx.arc(cx, cy, dotR * pop * pulse * appear, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Gauge (recession odds) ───────────────────────────────────────────────────
export function gauge(
  ctx: CanvasRenderingContext2D,
  opts: { cx: number; cy: number; r: number; value: number; p: number; t: number; label?: string }
): void {
  const { cx, cy, r, value, p, t } = opts;
  // v4 (vision panel re-review): a1 was 0, not 2π. Canvas normalises the
  // grey TRACK arc (π→0 reads as the top half), but every lerp() angle below
  // then computed positions on the WRONG half — the needle rendered mirrored
  // into the label area, each colour zone wrapped ~300° (the whole ring read
  // coral), and the 25/50/75% tick labels landed in the bottom quadrants.
  const a0 = Math.PI;
  const a1 = 2 * Math.PI;
  const frac = clamp01(value / 100) * easeOutCubic(clamp01(p / 0.8));
  const needleA = lerp(a0, a1, frac);
  // arc track
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba('#C8C2B2', 0.4);
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
  // colored zones
  ctx.strokeStyle = rgba(PALETTE.up, 0.55);
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, lerp(a0, a1, 0.3));
  ctx.stroke();
  ctx.strokeStyle = rgba(PALETTE.gold, 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, r, lerp(a0, a1, 0.3), lerp(a0, a1, 0.55));
  ctx.stroke();
  ctx.strokeStyle = rgba(PALETTE.down, 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, r, lerp(a0, a1, 0.55), a1);
  ctx.stroke();
  // minor radial ticks (v4: vision panel — a gauge without interior ticks
  // cannot be read against a number; every 10% inside the ring, subtle but
  // legible — the first attempt at 0.28 alpha was invisible at 1080p)
  ctx.strokeStyle = rgba(PALETTE.ink, 0.42);
  ctx.lineWidth = 2.5;
  for (let v = 10; v < 100; v += 10) {
    if (v % 25 === 0) continue; // major labels already anchor the quarters
    const a = lerp(a0, a1, v / 100);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20));
    ctx.lineTo(cx + Math.cos(a) * (r - 33), cy + Math.sin(a) * (r - 33));
    ctx.stroke();
  }
  // ticks
  setFont(ctx, 22, 600);
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.textAlign = 'center';
  for (let v = 0; v <= 100; v += 25) {
    const a = lerp(a0, a1, v / 100);
    const tx = cx + Math.cos(a) * (r + 34);
    const ty = cy + Math.sin(a) * (r + 34) + 6;
    ctx.fillText(`${v}%`, tx, ty);
  }
  // needle with spring
  const spring = Math.sin(clamp01(p / 0.8) * Math.PI) * 0.05 * (1 - clamp01(p / 0.8));
  const na = needleA + spring;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * (r - 8), cy + Math.sin(na) * (r - 8));
  ctx.stroke();
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.white;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  // value
  if (p > 0.7) {
    const ap = clamp01((p - 0.7) / 0.3);
    ctx.globalAlpha = ap;
    ctx.textAlign = 'center';
    setFont(ctx, 64, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(`${Math.round(value * easeOutCubic(clamp01(p / 0.8)))}%`, cx, cy - r * 0.18);
    if (opts.label) {
      setFont(ctx, 25, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.fillText(opts.label, cx, cy + 8);
    }
  }
  ctx.restore();
  void t;
}

// ── Big stat counter card ────────────────────────────────────────────────────
export function statCard(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    big: string;
    label: string;
    tag?: string;
    tone?: string;
    p: number;
    t: number;
    bigIsNumber?: boolean;
    decimals?: number;
    /** v4 (audit P0-1): compact row metrics for tight columns — 58px numeral,
     * 24px label, ~172px card height. The default metrics (88px numeral at
     * y+138, label from y+190) need a ≥240px card; the AI-datacenter scene
     * shipped 112px cards, so its text rendered OUTSIDE the card bodies and
     * the next card overpainted it. */
    compact?: boolean;
  }
): void {
  const { x, y, w, h, big, label, tag, tone = 'up', p, t } = opts;
  const ap = clamp01(p);
  const rise = (1 - easeOutCubic(ap)) * 26;
  const pop = easeOutBack(clamp01(ap / 0.7));
  ctx.save();
  ctx.globalAlpha = Math.min(1, ap * 1.6);
  ctx.translate(0, rise);
  const c = TONE(tone).main;
  card(ctx, x, y, w, h, { r: opts.compact ? 22 : 30 });
  const bigSize = opts.compact ? 58 : 88;
  const bigBase = opts.compact ? 84 : 138;
  const labelSize = opts.compact ? 24 : 27;
  const labelBase = opts.compact ? 126 : 190;
  const labelStep = opts.compact ? 30 : 36;
  // tone top accent line
  ctx.fillStyle = c;
  roundRect(ctx, x + 34, y + (opts.compact ? 22 : 26), (opts.compact ? 52 : 64) * pop, opts.compact ? 6 : 8, 3);
  ctx.fill();
  // big number
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let bigText = big;
  if (opts.bigIsNumber) {
    const v = parseFloat(big.replace(/[^0-9.\-]/g, ''));
    if (!Number.isNaN(v)) {
      const decimals = opts.decimals ?? (String(v).includes('.') ? 1 : 0);
      bigText = (v * easeOutCubic(ap)).toFixed(decimals) + big.replace(/^[^0-9.\-]+/, '').replace(/[0-9.]+$/, '');
      if (big.startsWith('$')) bigText = '$' + bigText;
      if (big.endsWith('T')) bigText = bigText.replace(/(\d+(\.\d+)?)$/, '$1T');
    }
  }
  setFont(ctx, bigSize, 700);
  ctx.fillStyle = c;
  ctx.fillText(bigText, x + 34, y + bigBase);
  // label
  setFont(ctx, labelSize, 600);
  ctx.fillStyle = PALETTE.inkSoft;
  const labelLines = wrapText(ctx, label, w - 68, labelSize, 600);
  labelLines.forEach((ln, i) => {
    ctx.fillText(ln, x + 34, y + labelBase + i * labelStep);
  });
  if (tag) {
    const tagP = clamp01((p - 0.45) / 0.4);
    if (tagP > 0) {
      ctx.globalAlpha = tagP;
      setFont(ctx, 22, 600);
      const tw = ctx.measureText(tag).width;
      ctx.fillStyle = TONE(tone === 'down' ? 'down' : tone).soft;
      const tagY = opts.compact ? y + h - 40 : y + h - 58;
      roundRect(ctx, x + 34, tagY, tw + 28, 36, 18);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.fillText(tag, x + 48, tagY + 24);
    }
  }
  ctx.restore();
  void t;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  size: number,
  weight: 300 | 400 | 600 | 700 = 400
): string[] {
  setFont(ctx, size, weight);
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Source tag bottom-right of a scene. */
export function sourceTag(
  ctx: CanvasRenderingContext2D,
  W: number,
  source: string | undefined,
  y: number,
  alpha = 1
): void {
  if (!source) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  setFont(ctx, 24, 400);
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.textAlign = 'right';
  ctx.fillText(`Source: ${source}`, W - 110, y);
  ctx.restore();
}

/** Scene title with animated underline sweep. */
export function sceneTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  p: number,
  maxW = 1500
): void {
  const ap = clamp01(p / 0.35);
  ctx.save();
  ctx.globalAlpha = ap;
  setFont(ctx, 54, 600);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  fitText(ctx, text, x, y, maxW, 54, 600);
  const tw = Math.min(ctx.measureText(text).width, maxW);
  const sw = tw * easeOutCubic(ap);
  ctx.fillStyle = PALETTE.gold;
  roundRect(ctx, x, y + 16, sw, 7, 3.5);
  ctx.fill();
  ctx.restore();
}
