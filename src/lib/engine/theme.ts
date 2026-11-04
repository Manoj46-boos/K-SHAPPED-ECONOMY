/**
 * Design system — "Morning Ivory": a light, premium, editorial look.
 * No dark backgrounds anywhere. Warm ivory canvas, ink strokes, gold accents,
 * teal-green for "up", warm coral for "down".
 */

export interface Palette {
  bgTop: string;
  bgBottom: string;
  bgSoft: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  card: string;
  cardBorder: string;
  gold: string;
  goldDeep: string;
  /** AA-safe gold for small gold TEXT (audit P0-4): 4.64:1 on white.
   * goldDeep is aligned to the same value in v4 so every existing gold
   * label, chip and kicker clears WCAG at any size; gold #C9A227 stays
   * for decorative strokes, rails and ≥40px display accents only. */
  goldInk: string;
  goldWash: string;
  up: string;
  upSoft: string;
  down: string;
  downSoft: string;
  muted: string;
  chipBg: string;
  white: string;
}

export const PALETTE: Palette = {
  // v5 "Bright Teal on White": the ivory→beige canvas becomes a pure-white
  // canvas; every border, wash and soft tint retints into the teal family.
  // Gold keeps its cameo (chapter cards, watermark, scarf) and is banned
  // from the always-on furniture. The audited text pairs are unchanged and
  // only gain contrast on the lighter canvas.
  bgTop: '#FFFFFF',
  bgBottom: '#F4F9F8',     // was #F4EFE4 (beige) — a teal-tinted breath
  bgSoft: '#F8FCFB',       // was #F8F5EC (ivory)
  ink: '#1E1F26',
  inkSoft: '#55555F',
  inkFaint: '#6B6B75',
  card: '#FFFFFF',
  cardBorder: '#DFEAE7', // was #E9E4D6 (khaki) — teal-grey hairlines
  gold: '#C9A227',
  goldDeep: '#8F6E12',
  goldInk: '#8F6E12',
  goldWash: '#F7F0DC',
  up: '#0B6E63',
  upSoft: '#D9EFEA',
  down: '#C2542E',
  downSoft: '#FAE7E1',     // was #F9E3DB
  muted: '#B2C4C1',        // was #B9B4A6 (warm grey) — cool grey to match teal
  chipBg: '#FFFFFF',
  white: '#FFFFFF',
};

// ── Typography (audit P1-1): bundled OFL faces, loaded by the studio page ───
// Fraunces (SIL OFL) replaces the Georgia lottery — an editorial display
// serif with real weights; Inter (SIL OFL) replaces the Windows-only Segoe
// UI stack. Both ship in /public/fonts and are @font-face'd in globals.css,
// so renders are pixel-identical on any machine, online or offline. The old
// families stay in the stack as last-resort fallbacks only.
export const FONT_DISPLAY =
  '"Fraunces", Georgia, "Times New Roman", "Songti SC", serif';
// v5: system-ui / -apple-system removed — node-canvas REJECTS font stacks
// containing them and silently falls back to the wrong family in headless
// renders (the harness caught it). Browsers are unaffected: Inter resolves
// first in the stack either way.
export const FONT_UI =
  '"Inter", "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const FONT_UI_SEMI =
  '"Inter", "Segoe UI Variable Display", "Segoe UI Semibold", "Segoe UI", Roboto, sans-serif';

export const TONE = (tone?: string): { main: string; soft: string } => {
  switch (tone) {
    case 'up':
      return { main: PALETTE.up, soft: PALETTE.upSoft };
    case 'down':
      return { main: PALETTE.down, soft: PALETTE.downSoft };
    case 'gold':
      return { main: PALETTE.goldDeep, soft: PALETTE.goldWash };
    default:
      return { main: PALETTE.ink, soft: PALETTE.bgSoft };
  }
};

// ── Layout metrics (1920×1080 design grid; scenes scale from W/H) ─────────────
export const M = {
  marginX: 110,
  marginTop: 96,
  titleY: 150,
  sourceY: 1012,
  captionY: 952,
  chapterLabelY: 74,
};

/**
 * Everything below this Y on the 1080-design grid belongs to the caption pill
 * (top of a 2-row pill ≈ 808) + progress bar. Scene content must stay above
 * it — or, deliberately, below the pill (pill bottom ≈ 956) in the narrow
 * gap above the progress bar. (Panel P0-2: four verified scene-text vs
 * caption-pill collisions shipped because scenes had no such constant.)
 */
export const CAPTION_ZONE_TOP = 800;

/** rgba() helper: pass a #rrggbb color and alpha. */
export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function hexLerp(a: string, b: string, t: number): string {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const ch = (i: number) =>
    Math.round(
      lerpH(parseInt(pa.slice(i, i + 2), 16), parseInt(pb.slice(i, i + 2), 16), t)
    );
  return `#${ch(0).toString(16).padStart(2, '0')}${ch(2).toString(16).padStart(2, '0')}${ch(4)
    .toString(16)
    .padStart(2, '0')}`;
}
const lerpH = (a: number, b: number, t: number): number => a + (b - a) * t;

// ── Canvas drawing helpers (pure functions over CanvasRenderingContext2D) ────
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  // v5: node-canvas renders arcTo on sub-10px rects with visible artifacts
  // (promoted from the render harness). Tiny plates read as rounded at
  // render scale anyway — plain rects are pixel-clean everywhere.
  if (w < 10 || h < 10) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.closePath();
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + rr, y, x + w, y, rr);
  ctx.arcTo(x + w, y + h, x + w, y + rr, rr);
  ctx.arcTo(x + rr, y + h, x, y + h, rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Premium soft layered shadow card. */
export function card(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { r?: number; alpha?: number; border?: boolean; glow?: string } = {}
): void {
  const { r = 26, alpha = 1, border = true, glow } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  // layered soft shadow
  ctx.fillStyle = rgba('#8C8474', 0.10);
  roundRect(ctx, x + 2, y + 9, w, h, r);
  ctx.fill();
  ctx.fillStyle = rgba('#8C8474', 0.07);
  roundRect(ctx, x + 1, y + 4, w, h, r);
  ctx.fill();
  if (glow) {
    ctx.fillStyle = glow;
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, r + 3);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.card;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  if (border) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = PALETTE.cardBorder;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  }
  ctx.restore();
}

export function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: 300 | 400 | 600 | 700 = 400,
  family = FONT_UI
): void {
  ctx.font = `${weight} ${size}px ${family}`;
}

/** Text that auto-shrinks to fit maxW. Returns the final size used. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  weight: 300 | 400 | 600 | 700 = 400,
  family = FONT_UI,
  fill = PALETTE.ink
): number {
  let s = size;
  setFont(ctx, s, weight, family);
  while (ctx.measureText(text).width > maxW && s > 14) {
    s -= 2;
    setFont(ctx, s, weight, family);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  return s;
}

/** Draws a small pill chip; returns total width. */
export function chip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    padX?: number;
    padY?: number;
    bg?: string;
    fg?: string;
    border?: string;
    weight?: 300 | 400 | 600 | 700;
    alpha?: number;
    iconDot?: string;
  } = {}
): number {
  const {
    size = 26,
    padX = 22,
    padY = 12,
    bg = PALETTE.white,
    fg = PALETTE.inkSoft,
    border = PALETTE.cardBorder,
    weight = 600,
    alpha = 1,
    iconDot,
  } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  setFont(ctx, size, weight);
  const tw = ctx.measureText(text).width;
  const dotW = iconDot ? size * 0.9 + 10 : 0;
  const w = tw + padX * 2 + dotW;
  const h = size + padY * 2;
  ctx.fillStyle = rgba('#8C8474', 0.08);
  roundRect(ctx, x + 1, y + 3, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.stroke();
  if (iconDot) {
    ctx.fillStyle = iconDot;
    ctx.beginPath();
    ctx.arc(x + padX + size * 0.45, y + h / 2, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = fg;
  ctx.fillText(text, x + padX + dotW, y + h / 2 + size * 0.36);
  ctx.restore();
  return w;
}

/** Measures a chip's width without drawing. */
export function chipWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { size?: number; padX?: number; iconDot?: boolean } = {}
): number {
  const { size = 26, padX = 22, iconDot } = opts;
  setFont(ctx, size, 600);
  return ctx.measureText(text).width + padX * 2 + (iconDot ? size * 0.9 + 10 : 0);
}

/** Soft radial glow blob. */
export function glowBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.6, rgba(color, alpha * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Paints the standard scene background: ivory gradient + faint gold horizon wash. */
export function paintBg(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t = 0
): void {
  // v5: pure-white base (no gradient — flat fields are the premium register),
  // one breathing teal wash. The gold corner wash is gone: on white, a
  // 5%-alpha gold blob reads as a smudge, not life.
  ctx.fillStyle = PALETTE.bgTop;
  ctx.fillRect(0, 0, W, H);
  const pulse = 0.5 + 0.5 * Math.sin(t / 6000);
  glowBlob(ctx, W * 0.82, H * 0.16 + driftY(t), W * 0.5, PALETTE.up, 0.030 + 0.012 * pulse);
  glowBlob(ctx, W * 0.1, H * 0.9, W * 0.42, PALETTE.up, 0.022 + 0.010 * (1 - pulse));
}

const driftY = (t: number): number => Math.sin(t / 5200) * 26;

/** Rounded line helper for strokes. */
export function inkStroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
