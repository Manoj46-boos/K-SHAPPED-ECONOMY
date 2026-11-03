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
  bgTop: '#FDFCF8',
  bgBottom: '#F4EFE4',
  bgSoft: '#F8F5EC',
  // Morning Ivory 2.0 (audit §8, Direction A — winner): every text pair
  // measured against WCAG AA. ink 16.0:1 · inkSoft 7.4:1 · inkFaint 5.2:1 ·
  // goldInk 4.6:1 · up 6.0:1 · down 4.5:1 on their real backgrounds.
  ink: '#1E1F26',
  inkSoft: '#55555F',
  inkFaint: '#6B6B75', // was #9A9AA3 (2.79:1 — source tags vanished on phones)
  card: '#FFFFFF',
  cardBorder: '#E9E4D6',
  gold: '#C9A227',
  goldDeep: '#8F6E12', // was #A8841B (3.51:1 — large text only)
  goldInk: '#8F6E12',
  goldWash: '#F7EFD7',
  up: '#0B6E63', // was #0E8074
  upSoft: '#DDF0EA',
  down: '#C2542E', // was #D96C47 (3.39:1 — large text only)
  downSoft: '#F9E3DB',
  muted: '#B9B4A6',
  chipBg: '#FFFFFF',
  white: '#FFFFFF',
};

export const FONT_DISPLAY =
  'Georgia, "Times New Roman", "Songti SC", serif';
export const FONT_UI =
  '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
export const FONT_UI_SEMI =
  '"Segoe UI Variable Display", "Segoe UI Semibold", "Segoe UI", system-ui, Roboto, sans-serif';

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
  const g = ctx.createLinearGradient(0, 0, W * 0.25, H);
  g.addColorStop(0, PALETTE.bgTop);
  g.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // breathing gold horizon wash (organic life, very subtle)
  const pulse = 0.5 + 0.5 * Math.sin(t / 6000);
  glowBlob(ctx, W * 0.82, H * 0.16 + driftY(t), W * 0.5, PALETTE.gold, 0.05 + 0.02 * pulse);
  glowBlob(ctx, W * 0.1, H * 0.9, W * 0.42, PALETTE.up, 0.035 + 0.015 * (1 - pulse));
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
