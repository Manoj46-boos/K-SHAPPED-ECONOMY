/**
 * Design system — "Morning Ivory": a light, premium, editorial look.
 * No dark backgrounds anywhere. Warm ivory canvas, ink strokes, gold accents,
 * teal-green for "up", warm coral for "down".
 */

// v9 (report P0-1): card()/chip()/fitText feed the collision guard when the
// harness enables it — every plated-through defect (D-01, D-02, the R7
// family) was content a guard like this would have caught at render time.
import { registerRect } from './collision';
// PHASE 4 (Visual Audit — FEED THUMB-STOP): the per-family stage world
// (floor plane, architecture band, desk edge) paints inside paintBg so
// EVERY scene inherits the fundSplit-grade depth system.
import { drawStageWorld } from './stage';

export interface Palette {
  bgTop: string;
  bgBottom: string;
  bgSoft: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  card: string;
  cardBorder: string;
  /** v8: the ONE shadow color (cool slate-teal). Was 14 scattered
   *  #8C8474 warm-taupe hexes — the panel called them "dirty beige". */
  shadow: string;
  /** v8: chart grids / dashed hairlines (cool). Was #B9B4A6 khaki. */
  grid: string;
  /** v8: bar tracks / inactive segments (cool). Was #C8C2B2 greige. */
  track: string;
  /** PHASE 2 (100-Judge audit Table 6): the pie REMAINDER register — a
   *  visible sage that reads against the gold wedge AND against the room
   *  wash at 320px (the muted track at 0.62 measured "near-invisible"). */
  sage: string;
  /** PHASE 2: the chapter-card numeral gold — one register DEEPER than
   *  goldDisplay: the audit's prescription ("the single most washed element
   *  in the film... it should be the strongest gold in the frame"). The
   *  460px fill numeral is not text — it is the card's hero mass. */
  goldNumeral: string;
  gold: string;
  goldDeep: string;
  /** AA-safe gold for small gold TEXT (audit P0-4): 4.64:1 on white.
   * goldDeep is aligned to the same value in v4 so every existing gold
   * label, chip and kicker clears WCAG at any size; gold #C9A227 stays
   * for decorative strokes, rails and ≥40px display accents only. */
  /** v8: the DISPLAY gold — bright bronze for large fills and ≥60px
   *  numerals (3.2:1 on white, passes large-text AA). goldDeep stays the
   *  small-text gold; the pie's 'gold' wedge was filling with goldDeep
   *  (#8F6E12) and reading as a dark-olive BROWN mass — the panel flagged
   *  it twice. Fills and display type now use this; nothing gold goes
   *  darker than bronze anywhere in the frame. */
  goldDisplay: string;
  goldInk: string;
  goldWash: string;
  up: string;
  upSoft: string;
  down: string;
  downSoft: string;
  /** v10 (panel COLOR-3): the VIVID data-ink ramp. Frames measured 72–93%
   *  near-white at saturation < 10 — the "washed after transcode" read.
   *  These are for NON-TEXT strokes only (chart lines, K arms, bar fills,
   *  gauge zones): one step brighter than up/down so data ink survives the
   *  platform re-encode on a phone. Never used for text (contrast on white
   *  is ~3:1 — text keeps up/down, which clear AA). */
  upVivid: string;
  downVivid: string;
  /** v10: display headline ink — one step deeper than ink for 60px+ display
   *  lines only (bigText line 1, chapter-card titles). 11.9:1 on white;
   *  gives the statement beats the weight the panel asked for without
   *  touching body text. */
  inkDeep: string;
  muted: string;
  chipBg: string;
  white: string;
}

export const PALETTE: Palette = {
  // v8 "Premium White": the v5 white→teal canvas, now with ZERO warm-taupe
  // hexes anywhere in the film. The v5 retheme retinted the named palette
  // but left #8C8474/#B9B4A6/#C8C2B2 scattered through shadows, grids and
  // tracks (39 sites) — the vision panel read them as "aged paper / dirty
  // beige" in every frame they touched. Every neutral below is now a cool
  // slate-teal: the same warmth-free family as the accent system.
  // AUDIT-PHASE-1: ivory canvas deepens to warm cream (#FFFFFF -> #F4EFE1)
  // — drops mean luminance ~16 points, every frame reads as warm cream
  // instead of whiteboard. Brand identity preserved (still Morning Ivory).
  //
  // PHASE-0 (100-judge report §6, Fix 1 — THE REGISTER PASS): the pixel
  // audit measured 19 rendered frames at mean luminance 222-235/255 (~88%
  // bright), RMS contrast 24-54, saturation 0.04-0.13 — "a clean white
  // presentation, not flat-animation cinema". The register deepens one more
  // step, everywhere, by constants only: bgTop #F4EFE1 -> #EDE6D2 (warm
  // cream, -8 lum) and bgBottom #D7E5DF -> #C9DAD4 (-9 lum). Target mean
  // luminance 200-210 with RMS 40+ per frame — the report's own gate.
  bgTop: '#EDE6D2',
  // PHASE-0: bgBottom deepens #D7E5DF -> #C9DAD4 — the ground gradient
  // strengthens further; the figure's floor gains mass.
  bgBottom: '#C9DAD4',
  // PHASE-0: bgSoft deepens #EAF1ED -> #DFE9E4 — the haze bands and neutral
  // plates ride this value; they follow the new register down.
  bgSoft: '#DFE9E4',
  // AUDIT-PHASE-1: ink deepens #2E4A43 -> #1F3328 — deeper ink raises
  // perceived ink-mass weight without changing the hue family. Still
  // slate-teal, still AAA contrast, just visibly heavier.
  ink: '#152420',
  inkSoft: '#4F5D59',
  inkFaint: '#65736F',
  card: '#FBFAF4',
  cardBorder: '#DCE9E5',
  // v8: the three neutral ROLES the brown hexes used to fill. One source
  // of truth; scenes must use these, never hand-hexed greys.
  shadow: '#5E6E68',   // was #8C8474 everywhere (warm taupe) — cool slate now
  grid: '#AABBB5',      // was #B9B4A6 (warm khaki) — chart grids, hairlines
  track: '#C7D2CD',     // was #C8C2B2 (warm greige) — bar tracks, inactive fills
  sage: '#7E9C88',      // PHASE 2: visible sage — pie remainder, muted swatches
  goldNumeral: '#B08414', // PHASE 2: chapter numeral — one register deeper than goldDisplay
  gold: '#C9A227',
  goldDeep: '#8F6E12',
  /** v8: the DISPLAY gold — bright gold for large fills, wedges and
   *  display numerals. v8.1 recheck: the first pass used bronze #B08A1E
   *  (chosen for 3.2:1 large-text AA) and the recheck judge still read the
   *  pie wedge as "dark olive-brown" — at fill scale anything darker than
   *  #C9A227 reads brown. Fills/wedges/swatches now use the full bright
   *  gold (same value as `gold`); small TEXT gold stays goldInk #8F6E12
   *  (4.8:1) and mid-size gold text uses goldInk too — nothing text-sized
   *  renders in the bright fill gold. */
  // AUDIT-PHASE-1: display gold brightens #C9A227 -> #D9B224 — survives
  // the platform transcode at 320 px; pie wedges and big numerals read
  // as gold, not brown.
  goldDisplay: '#D9B224',
  goldInk: '#8F6E12',
  // PHASE-0 (report §6, Fix 1 — THE REGISTER PASS, round 2): the first
  // pass deepened bgTop/bgBottom but the rendered frames barely moved —
  // because the FRAME's brightness is set by the PLATE BLEND, not the
  // base: upSoft/goldWash/downSoft at 0.82 over bgTop computed back to
  // ~233 mean luminance (measured on the chartTwin AFTER frame: 232.8).
  // The soft tones themselves are the register. Each drops ~10 lum:
  //   upSoft   #D9EFEA -> #C9E2DA (the data rooms' teal field)
  //   goldWash #F7F0DC -> #EDE2C2 (statement/end rooms' gold field)
  //   downSoft #FAE7E1 -> #F2DAD2 (mood rooms' coral field — gentlest
  //                                step: coral rooms already ran lowest)
  // Target: every scene frame lands 200-215 mean luminance, RMS 30+.
  goldWash: '#EDE2C2',
  up: '#0B6E63',
  upSoft: '#C9E2DA',
  down: '#C2542E',
  downSoft: '#F2DAD2',
  // v10 (panel COLOR-3): the vivid data-ink ramp — strokes only, never text
  upVivid: '#00937F',
  downVivid: '#E85C31',
  inkDeep: '#243B35',
  muted: '#B2C4C1',
  chipBg: '#FBFAF4',
  white: '#FFFFFF',
};

/** Minimum type size (design px, 1920×1080 grid). Nothing the viewer
 *  must READ renders below this — the phone-gate panel (audit §8) measured
 *  the 28px floor at 4.7px after the 320px downsample: broadcast-
 *  legibility research puts readable body text at 40-60px on this grid.
 *  AUDIT-ROUND-2 (fix 1): 28 → 40 for anything the viewer must READ.
 *  Captions are exempt (pill-backed, already large — see textfx). Where
 *  text cannot fit at this floor the content must wrap or shorten —
 *  never shrink. */
export const TYPE_FLOOR = 40;

/** AUDIT-ROUND-2 (fix 1): the LABEL floor — legends, axis tags, kickers,
 *  source tags and chip text. One step under the READ floor: labels are
 *  glanceable identifiers, not body copy, and 34px survives the 320px
 *  gate (≈5.7px) where 28px (4.7px) did not. */
export const LABEL_FLOOR = 34;

/** Dev-mode warning sink for floor violations (the studio can surface it). */
export function typeFloorWarn(site: string, size: number): void {
  if (process.env.NODE_ENV !== 'production' && typeof console !== 'undefined') {
    // non-fatal: clamped text still renders AT the floor; this exists so a
    // too-long string surfaces in dev instead of silently shipping tiny.
    console.warn(`[theme] TYPE_FLOOR clamp at ${site}: text wanted <${size}px>`);
  }
}

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

export const TONE = (tone?: string): { main: string; soft: string; vivid?: string } => {
  switch (tone) {
    case 'up':
      // v10: vivid stroke color rides along — callers opt in for line/bar ink
      return { main: PALETTE.up, soft: PALETTE.upSoft, vivid: PALETTE.upVivid };
    case 'down':
      return { main: PALETTE.down, soft: PALETTE.downSoft, vivid: PALETTE.downVivid };
    case 'gold':
      // v8: display gold for fills + big numerals (was goldDeep — read
      // as brown on the pie; see goldDisplay note above)
      return { main: PALETTE.goldDisplay, soft: PALETTE.goldWash, vivid: PALETTE.goldDisplay };
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
  // PANEL-9 R7 (broken boxes everywhere): the previous arcTo sequence passed
  // wrong control points — each corner call used the NEXT corner's vertex as
  // its tangent point, so every rounded plate in the film (caption pills,
  // chips, cards, chart bands, rack boxes, callouts) filled as a skewed
  // wedge with diagonal edges and pinched ends, and text spilled outside
  // (verified at pixel level: a 200×100 r20 plate failed 5/10 shape probes).
  // Correct arcTo usage: (x1,y1) is the CORNER vertex, (x2,y2) lies on the
  // edge that follows it. Classic four-corner sequence, spec-exact:
  ctx.arcTo(x + w, y, x + w, y + h, rr); // top-right corner
  ctx.arcTo(x + w, y + h, x, y + h, rr); // bottom-right corner
  ctx.arcTo(x, y + h, x, y, rr); // bottom-left corner
  ctx.arcTo(x, y, x + w, y, rr); // top-left corner
  ctx.closePath();
}

/** Premium soft layered shadow card.
 *  v10 (panel COLOR-4): `tint` — tone-colored shadows. A white card floating
 *  on white with a slate shadow reads neutral everywhere; a card carrying a
 *  coral stat gets a whisper of coral in its shadow, which the eye reads as
 *  the card being LIT by its content. Same alphas, hue follows the tone. */
export function card(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { r?: number; alpha?: number; border?: boolean; glow?: string; tint?: string } = {}
): void {
  const { r = 26, alpha = 1, border = true, glow, tint } = opts;
  registerRect(`card@${Math.round(x)},${Math.round(y)}`, x, y, w, h);
  ctx.save();
  ctx.globalAlpha = alpha;
  // layered soft shadow — v8: cool slate (was warm taupe #8C8474)
  // v10: tinted variant when the caller passes the content tone
  // v10.1 (panel 11 re-review, COLOR-4): the v10 tint shipped at the old
  // 0.10/0.07 alphas — below perceptual threshold; the pair judge read the
  // AFTER shadow as "essentially the same flat gray". Tinted cards now cast
  // a clearly readable tone shadow (0.18/0.12, +2px drop) — still a
  // whisper, but one the eye can actually see; neutral cards step to
  // 0.13/0.09 so the whole film's shadow grammar stays consistent.
  // PANEL-12 / P3-3 (report §15.3): ONE LIGHT, EVERYWHERE. The film's
  // shadows fell in a mix of directions (+2/+10, +1/+5…). Every shadow
  // now offsets to the lower-LEFT (light from the upper right): the two
  // card passes at (−6, +12) and (−5, +7). Consistent light is the
  // cheapest depth cue in 2D — and its absence was the loudest.
  const sh = tint ?? PALETTE.shadow;
  const a1 = tint ? 0.18 : 0.13;
  const a2 = tint ? 0.12 : 0.09;
  ctx.fillStyle = rgba(sh, a1);
  roundRect(ctx, x - 6, y + 12, w, h, r);
  ctx.fill();
  ctx.fillStyle = rgba(sh, a2);
  roundRect(ctx, x - 5, y + 7, w, h, r);
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

/** Text that auto-shrinks to fit maxW. Returns the final size used.
 *  v9 (report D-07): the old floor of 14px broke the TYPE_FLOOR promise —
 *  fitText itself was the biggest sub-floor offender. It now clamps at
 *  TYPE_FLOOR (28) and warns in dev; a caller that needs smaller must wrap
 *  or shorten the string, not shrink the type. */
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
  while (ctx.measureText(text).width > maxW && s > TYPE_FLOOR) {
    s -= 2;
    setFont(ctx, s, weight, family);
  }
  if (ctx.measureText(text).width > maxW && s <= TYPE_FLOOR) {
    typeFloorWarn(`fitText("${text.slice(0, 24)}…")`, s);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  registerRect(`fitText:${text.slice(0, 18)}`, x, y - s, ctx.measureText(text).width, s * 1.2);
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
    size = 28,
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
  registerRect(`chip:${text.slice(0, 14)}`, x, y, w, h);
  // PANEL-12 / P3-3: the chip shadow joins the one-light rule (−5, +7)
  ctx.fillStyle = rgba(PALETTE.shadow, 0.08);
  roundRect(ctx, x - 5, y + 7, w, h, h / 2);
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
  const { size = 28, padX = 22, iconDot } = opts;
  setFont(ctx, size, 600);
  return ctx.measureText(text).width + padX * 2 + (iconDot ? size * 0.9 + 10 : 0);
}

// ── 100-JUDGE PANEL / Phase 4 item 4.3 — THE VALUE-PLANE SYSTEM ─────────────
// D-15: "Value-plane sameness — same cream card + pill grammar in 17/18
// sampled frames; chapters change hue, not plane." The fix: the film's
// value moments rotate between THREE materials, keyed deterministically to
// the chapter so consecutive value chapters alternate:
//   'card' — the house cream card (the existing grammar, kept);
//   'room' — a full-bleed tone slab in the chapter cards' own material
//            (soft tone at 1.0, gold rule, no shadow — architecture, not
//            furniture);
//   'desk' — no plate at all: the value set directly on the room
//            background over one horizontal ink rule (ledger style).
// Geometry NEVER changes across planes — same x/y/w/h — so every layout
// certification the card grammar earned carries over; only the material
// rotates. Scrub-safe: pure functions of their arguments.

export type ValuePlane = 'card' | 'room' | 'desk';

/** The chapter-keyed plane rotation: card → room → desk → card … Consecutive
 *  chapters that carry values now sit on different materials (the audit's
 *  own alternation ask), and the read dies that "by frame 14 the eye stops
 *  registering new information". */
export function valuePlaneFor(chapterIdx: number): ValuePlane {
  const rot: ValuePlane[] = ['card', 'room', 'desk'];
  return rot[((chapterIdx % 3) + 3) % 3];
}

/** The ROOM plane's field color — the chapter-card tone ONE register down:
 *  the soft tone mixed 48% toward its main (gold toward goldDeep, its
 *  text-safe register). Solid enough that a slab never reads as a pale
 *  chip; ink numerals on it hold ≈5.5:1. One source of truth for every
 *  room-plane fill (toneRoom + the statCards chips). */
export function roomFill(tone: string): string {
  const tn = TONE(tone);
  return tone === 'gold'
    ? mixHex(PALETTE.goldWash, PALETTE.goldDeep, 0.48)
    : mixHex(tn.soft, tn.main, 0.48);
}

/** The ROOM plane slab — the chapter cards' material at value-block size:
 *  a full tone field DEEPENED to the room register (see roomFill),
 *  ARCHITECTURALLY SHARP (3px corner — the chapter card's fillRect
 *  genealogy; a floating card's 22-34px rounding is the other material's
 *  signature), flat (no layered shadow), with the gold rule at the caller's
 *  accent slot. Numerals on a room slab ride INK. Drawn in scene space. */
export function toneRoom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tone: string,
  opts: { ruleX?: number; ruleY?: number; ruleW?: number; ruleH?: number; grow?: number; alpha?: number } = {}
): void {
  const { ruleX = x + 34, ruleY = y + 26, ruleW = 64, ruleH = 8, grow = 1, alpha = 1 } = opts;
  registerRect(`toneRoom@${Math.round(x)},${Math.round(y)}`, x, y, w, h);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = roomFill(tone);
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  // the gold rule rides goldInk on the deep field (goldDisplay washes on it)
  ctx.fillStyle = tone === 'gold' ? PALETTE.goldInk : PALETTE.gold;
  if (grow > 0) roundRect(ctx, ruleX, ruleY, Math.max(2, ruleW * grow), ruleH, ruleH / 2);
  ctx.fill();
  ctx.restore();
}

/** The DESK plane rule — one horizontal ink hairline the value sits on,
 *  ledger-style. `grow` drives the draw-on. Registered so the guard sees
 *  the line as content. */
export function deskRule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  grow = 1,
  alpha = 1
): void {
  if (grow <= 0) return;
  registerRect(`deskRule@${Math.round(x)},${Math.round(y)}`, x, y, Math.max(2, w * grow), 4);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = rgba(PALETTE.ink, 0.55);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w * grow, y);
  ctx.stroke();
  ctx.restore();
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

/** PHASE-2 (report §11 Phase 2): linear hex lerp — the chapter wash mixes
 *  the soft room tone toward its vivid accent. a/b are #RRGGBB, t 0..1. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t);
  const r = ch((pa >> 16) & 255, (pb >> 16) & 255);
  const g = ch((pa >> 8) & 255, (pb >> 8) & 255);
  const bl = ch(pa & 255, pb & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/** v10 (panel COLOR-2) — the editorial SCENE PLATE: a full-width, barely-
 *  tinted rounded plate that data scenes sit on. The v8 frames floated white
 *  cards on raw white — measured 72–93% near-white per frame, which the
 *  panel read as "a spreadsheet on a lightbox". A soft tone wash (upSoft /
 *  goldWash at ~55% on white) behind the whole scene gives charts a ROOM to
 *  live in; white cards then pop forward instead of dissolving. Drawn right
 *  after paintBg, before the bokeh (motes float over the plate = depth).
 *  Never registered with the guard — it is background, not reading content.
 *
 *  PHASE-2 (report §11 Phase 2 — BRING BACK THE COLOR):
 *  1. The multiply plate strength is CUT from ~0.48 to 0.30 (0.95 × 0.32):
 *     the rooms lighten one step and stop drying into fog.
 *  2. The chapter wash now ROUTES THROUGH THE VIVID ACCENTS the palette
 *     already defines — each room tone mixes 17% toward its vivid accent
 *     (up #0B6E63 teal / down #C2542E coral / gold #C9A227) so the plate
 *     carries the chapter's hue at a perceptible chroma instead of grey-sage.
 *  3. The acceptance bar is MEASURED per frame by the panel's pixel_audit
 *     script: saturation ≥ 0.12 on every host and data frame while mean
 *     luminance stays inside 180-215. */
export function scenePlate(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  tone: 'up' | 'down' | 'gold' | 'neutral' = 'neutral',
  // 100-JUDGE AUDIT / fix 6.3 (THE REGISTER PASS, round 2): 0.82 -> 0.95 —
  // the audit's measured target is mean luminance 180-205 on data rooms
  // (the dark datacenter at 191 was the film's best composite by every
  // judge's account; the rooms must meet the datacenter). Multiply at
  // 0.475 alpha lands 6-10 points deeper than the 0.82 blend while the
  // white card foregrounds keep their deliberate pop.
  strength = 0.95,
  // PHASE 4 (audit §7 — ROOM ARCHITECTURE PER CHAPTER FAMILY): the
  // chapter family key from chapterFamily(). "A re-tint is not a new
  // room" — the chapter tones rotate the hue but not the ARCHITECTURE;
  // the fix is per-family OWNED furniture (the audit's own pattern: the
  // gauge IS chapter c5's owned object; the racks are c6's). Each family
  // that lacks a scene-level owned object gets ONE bold top-edge rail
  // — architecture the feed can read, never a re-tint.
  family: string | null = null,
  // PHASE-0 VISUAL AUDIT (this repo, frame evidence BEFORE_fix1-2): statement
  // beats (bigText / stampCard / quoteCard) are typography-first frames — the
  // per-tone furniture (window + desk edge / shelf wall) reads there as ghost
  // UI panels floating over the type, and the desk hairline cuts the slam.
  // Callers pass { furniture: false } for a clean stage: plate, wash, floor
  // band and family rails stay; only the window/shelf/desk props skip.
  opts: { furniture?: boolean } = {}
): void {
  // PHASE-0 (report §6, Fix 1): default plate strength 0.72 -> 0.82 — the
  // audit measured data/host rooms still washing out under the 0.72 blend
  // with the old bright base. With the deepened bgTop the 0.82 plate lands
  // the report's tonal-mass target on data rooms and host stages without
  // touching lightness elsewhere (statement beats keep their explicit
  // 0.88).
  // P1-2 note: the neutral tone is #E0EFE9 (was #EAF4F1) — the old value's
  // red channel (234) still landed >235 after the 0.72 blend, so every
  // 'neutral'-chapter frame kept failing the near-white acceptance. #E0EFE9
  // blends to r≈233: a whisper deeper, still the lightest room in the film.
  // PHASE-0: neutral follows the register down: #E0EFE9 -> #DCE9E3.
  const softBase =
    tone === 'up' ? PALETTE.upSoft
    : tone === 'down' ? PALETTE.downSoft
    : tone === 'gold' ? PALETTE.goldWash
    : '#DCE9E3';
  // PHASE-2 (report §11 Phase 2): the chapter wash routes through the VIVID
  // accent tones — each room tone leans on its accent's hue at a fixed 17%
  // so the room reads as teal / coral / gold, never grey-sage.
  const soft = mixHex(
    softBase,
    tone === 'down' ? PALETTE.down
    : tone === 'gold' ? PALETTE.gold
    : PALETTE.up,
    0.17
  );
  ctx.save();
  // 100-JUDGE PANEL REPORT (fix C1 — THE MULTIPLY REGISTER): three rounds
  // of "deepen bgTop" failed because alpha-over of pale colors converges
  // to the plate, not to the target (alpha-over of a #E-toned soft at 0.82
  // over the ivory lands within ~4 luminance points of the base — the
  // arithmetic reason the register never moved). The plate composites
  // MULTIPLY at half strength: multiply actually darkens, and the room
  // finally reads as a tonal field instead of a slightly greener white.
  // PHASE-2 (report §11 Phase 2): the multiply plate strength is CUT from
  // ~0.48 (0.95 × 0.5) to 0.30 (0.95 × 0.32) — the rooms lighten one step;
  // the vivid mixing above carries the color instead of the grey weight.
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = rgba(soft, strength * 0.32);
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // PHASE-2 (report §11 Phase 2): THE VIVID CHAPTER WASH — a direct wash of
  // the chapter's vivid accent over the plated room. Measured arithmetic
  // (pixel_audit on the 9-frame set): the plate cut alone DROPS frame
  // saturation (the multiply removes more chroma than a soft-tone mix
  // returns), and the audit's (max−min) metric is hue-ordered — coral and
  // gold align with the warm cream canvas and amplify, while teal fights
  // it (teal's lowest channel is red, the canvas's highest). Calibrated
  // per tone against the acceptance bar (sat ≥ 0.12, lum 180-215):
  // teal rides upVivid softened 25% toward upSoft (a darker wash breaches
  // the luminance floor on the card-less statement frames); coral stays
  // near-whisper (the R6 dirty-salmon ceiling on peach-gradient scenes
  // still binds); gold rooms already clear the bar on their own plate
  // (0.130-0.142) and take only a unifying whisper.
  const vividUp = mixHex(PALETTE.upVivid, PALETTE.upSoft, 0.25);
  const vividWash =
    tone === 'down' ? rgba(PALETTE.down, 0.16 * (strength / 0.95))
    : tone === 'gold' ? rgba(PALETTE.gold, 0.10 * (strength / 0.95))
    : rgba(vividUp, 0.34 * (strength / 0.95));
  ctx.fillStyle = vividWash;
  ctx.fillRect(0, 0, W, H);
  // BLUEPRINT Phase 4 (report §11): the FLOOR BAND — a soft gradient ramp
  // under the presenter's ground line (host ground ≈ 0.66·H; the band
  // ramps from there to the frame bottom). The frame gains a GROUND LINE:
  // the stage reads as a floor the figures stand on, not a lightbox they
  // float over. Soft-edged (a gradient, never a hard stripe), background —
  // never registered with the collision guard.
  // 100-JUDGE PANEL REPORT (fix B2 — THE INVISIBLE FLOOR): the band drew
  // at 0.06/0.085 ink alpha over an 0.82-alpha plate — arithmetic that
  // lands 2-3 luminance points above the room: invisible. The audit's
  // numbers (0.16/0.22) put the floor 8-12 points below the room —
  // visible, still light-register.
  {
    const bandTop = H * 0.66;
    const fg = ctx.createLinearGradient(0, bandTop, 0, H);
    fg.addColorStop(0, rgba(PALETTE.ink, 0));
    // fix 6.3: 0.16/0.22 -> 0.20/0.28 — the ground must read as a FLOOR the
    // figure stands on at the 320px gate, not a whisper under the plate.
    fg.addColorStop(0.45, rgba(PALETTE.ink, 0.2));
    fg.addColorStop(1, rgba(PALETTE.ink, 0.28));
    ctx.fillStyle = fg;
    ctx.fillRect(0, bandTop, W, H - bandTop);
  }
  // ── 100-JUDGE VISUAL AUDIT (Phase 1 — OWNED ENVIRONMENT LANGUAGE) ───────
  // Two or three RECURRING furniture elements per room family, riding the
  // plate every frame — the change that makes a scrubbed frame recognizable
  // as "the Data Desk" in a feed:
  //   studio rooms ('up' / 'down'): the mullioned WINDOW top-right (which IS
  //     the room's light source — the film's light is upper-right, the same
  //     side every rim light already falls) + the DESK EDGE bottom-right;
  //   data rooms ('gold'): the SHELF LINE top-left with book spines + the
  //     FLOOR MATERIAL (sparse plank ticks over the floor band) + the shelf
  //     LAMP's warm glow (the light prop);
  //   neutral (statement rooms): the window light only — typography keeps
  //     a clean stage.
  // Whisper register (≤0.20 ink alpha), fixed geometry, pure function of
  // (W, H) — static furniture, scrub-safe, background plane (behind every
  // content rect by construction), never registered with the guard.
  // P8 (SHORTS STAGING, 100-judge audit §13): the furniture geometry was
  // authored for 16:9 — in a 9:16 portrait room the window/shelf land as a
  // clipped pale slab in the top corner (the audit measured it in every
  // vertical frame). Portrait rooms are ARCHITECTURE-FREE: the plate, the
  // floor band and the light stay; the furniture block is skipped.
  if (H > W) {
    // portrait: keep only the floor band drawn above, skip furniture
  } else if (opts.furniture !== false) {
  {
    const inkW = rgba(PALETTE.ink, 0.16);
    ctx.lineCap = 'round';
    if (tone === 'up' || tone === 'down') {
      // THE WINDOW (the light prop) — top-right, a 2×2 mullioned pane with
      // a warm interior wash: the room's light source, matching the rim
      // light's upper-right incidence.
      const wx = W * 0.775, wy = H * 0.10, ww = W * 0.085, wh = H * 0.20;
      ctx.save();
      // PHASE 4 (audit §7): the whisper register (0.07-0.10 alpha) was
      // INVISIBLE at feed scale — "designed texture that cannot clear the
      // transcode is decoration, by the pipeline's own two-tier mask
      // logic." The window rises to functional alpha with real mass:
      // warm pane fill, a 3.5px frame, a sill — architecture, not hairlines.
      const wg = ctx.createLinearGradient(wx, wy, wx, wy + wh);
      wg.addColorStop(0, rgba(PALETTE.gold, 0.34));
      wg.addColorStop(1, rgba(PALETTE.gold, 0.16));
      ctx.fillStyle = wg;
      roundRect(ctx, wx, wy, ww, wh, 10);
      ctx.fill();
      ctx.strokeStyle = rgba(PALETTE.ink, 0.34);
      ctx.lineWidth = 3.5;
      roundRect(ctx, wx, wy, ww, wh, 10);
      ctx.stroke();
      ctx.strokeStyle = rgba(PALETTE.ink, 0.24);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2);
      ctx.lineTo(wx + ww, wy + wh / 2);
      ctx.stroke();
      // the sill — a filled ledge under the window (owned architecture)
      ctx.fillStyle = rgba(PALETTE.ink, 0.26);
      roundRect(ctx, wx - 10, wy + wh, ww + 20, 9, 4);
      ctx.fill();
      ctx.restore();
      // THE DESK EDGE — one ink hairline + leg tick, bottom-right: the desk
      // the presenter works at, at the frame's margin, under every card.
      const dy2 = H * 0.905;
      ctx.save();
      // PHASE 4: the desk gains its top FACE (a filled plank) — one
      // hairline was whisper-invisible; a desk reads as a desk with mass.
      ctx.fillStyle = rgba(PALETTE.ink, 0.14);
      roundRect(ctx, W * 0.60, dy2 - 10, W * 0.37, 12, 6);
      ctx.fill();
      ctx.strokeStyle = rgba(PALETTE.ink, 0.34);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(W * 0.60, dy2);
      ctx.lineTo(W * 0.97, dy2);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W * 0.855, dy2);
      ctx.lineTo(W * 0.855, dy2 + H * 0.045);
      ctx.stroke();
      ctx.restore();
    } else if (tone === 'gold') {
      // THE SHELF LINE — top-left: two hairlines with five book spines of
      // varying heights (the data room's library wall).
      // (the lower shelf line rode the scene title's baseline — the stack
      // sits ABOVE the 0.20H title band)
      const sy1 = H * 0.075, sy2 = H * 0.145, sx0 = W * 0.055, sx1 = W * 0.17;
      ctx.save();
      // PHASE 4: the shelf rises to functional alpha — filled spines with
      // title bands (books, not whiskers), a bracket under each shelf end.
      ctx.strokeStyle = rgba(PALETTE.ink, 0.32);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(sx0, sy1); ctx.lineTo(sx1, sy1);
      ctx.moveTo(sx0, sy2); ctx.lineTo(sx1, sy2);
      ctx.stroke();
      ctx.fillStyle = rgba(PALETTE.ink, 0.30);
      const heights = [34, 26, 30, 22, 28];
      const widths = [10, 8, 11, 8, 9];
      heights.forEach((bh, i) => {
        const bx = sx0 + 14 + i * (sx1 - sx0 - 40) / 5;
        ctx.fillRect(bx, sy1 - bh, widths[i], bh);
        // the spine's title band (gold on ink — the library wall reads)
        ctx.fillStyle = rgba(PALETTE.gold, 0.42);
        ctx.fillRect(bx + 1, sy1 - bh + 5, widths[i] - 2, 4);
        ctx.fillStyle = rgba(PALETTE.ink, 0.30);
      });
      // the shelf brackets
      ctx.strokeStyle = rgba(PALETTE.ink, 0.30);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx0 + 4, sy1); ctx.lineTo(sx0 + 4, sy1 + 8);
      ctx.moveTo(sx1 - 4, sy1); ctx.lineTo(sx1 - 4, sy1 + 8);
      ctx.stroke();
      ctx.restore();
      // THE LAMP GLOW (the light prop) — the shelf lamp's warm pool
      glowBlob(ctx, W * 0.105, H * 0.11, W * 0.09, PALETTE.gold, 0.30);
      // THE FLOOR MATERIAL — sparse plank ticks over the floor band: the
      // data room's boarded floor (the studio keeps its clean gradient).
      ctx.save();
      ctx.strokeStyle = rgba(PALETTE.ink, 0.16);
      ctx.lineWidth = 3;
      for (let i = 0; i < 14; i++) {
        const px2 = ((i * 173) % W);
        const py2 = H * 0.70 + ((i * 97) % Math.round(H * 0.24));
        ctx.beginPath();
        ctx.moveTo(px2 - 26, py2);
        ctx.lineTo(px2 + 26, py2);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // neutral statement rooms — the window light only (clean stage)
      glowBlob(ctx, W * 0.885, H * 0.155, W * 0.11, PALETTE.gold, 0.24);
    }
  }
  } // P8: end of the landscape-only furniture wrapper (portrait rooms are
    // architecture-free — the 9:16 crop clipped the window into a slab)

  // ── PHASE 4 (audit §7 — ROOM ARCHITECTURE PER CHAPTER FAMILY) ──────────
  // "Every scene sits in the same room: one gradient wash, one floor band
  // ... the chapter tones rotate the hue but not the ARCHITECTURE. A
  // re-tint is not a new room." Each family that lacks a scene-level
  // owned object gets ONE bold top-edge rail — the family's own
  // architecture, drawn at FUNCTIONAL alpha (>= 0.35 effective), pure
  // function of (W, H), background plane, never registered with the
  // guard. The top-edge band (y 14-52 of 1080) is certified empty in
  // every layout (title rails start at ~0.06H). Families whose scenes
  // already own big props (charts, machines, datacenter) or whose frames
  // are full-bleed compositions (takeaways, end screen) keep the clean
  // stage — fewer, bolder, not more.
  if (family) {
    ctx.save();
    ctx.lineCap = 'round';
    const fy = 20; // the rail's centerline (design space, 1080 grid)
    if (family === 'market') {
      // THE TICKER RAIL — the market room's own architecture: an ink tape
      // line with live price tags (up teal / down coral) and a LIVE dot.
      ctx.strokeStyle = rgba(PALETTE.ink, 0.36);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W * 0.06, fy + 16);
      ctx.lineTo(W * 0.94, fy + 16);
      ctx.stroke();
      // the rail starts past the channel lockup (x >= 0.17W — the
      // lockup owns 0.02-0.14W; the rail never plates it)
      const tags: [number, string, string][] = [
        [0.17, '+18%', PALETTE.up], [0.36, '+20%', PALETTE.up],
        [0.56, '-7%', PALETTE.down], [0.76, '+11%', PALETTE.up],
      ];
      tags.forEach(([fx, label, col]) => {
        const tx = W * fx;
        ctx.fillStyle = rgba(col, 0.42);
        roundRect(ctx, tx, fy - 10, 86, 34, 8);
        ctx.fill();
        ctx.strokeStyle = rgba(PALETTE.ink, 0.34);
        ctx.lineWidth = 2.5;
        roundRect(ctx, tx, fy - 10, 86, 34, 8);
        ctx.stroke();
        ctx.fillStyle = rgba(PALETTE.ink, 0.62);
        ctx.font = '700 20px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, tx + 43, fy + 14);
      });
      // the LIVE dot — the tape is alive
      ctx.fillStyle = rgba(PALETTE.down, 0.55);
      ctx.beginPath();
      ctx.arc(W * 0.905, fy + 16, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (family === 'charts') {
      // THE PEGBOARD STRIP — the analyst's wall: a dotted peg row with two
      // hanging tools (ruler, pencil) silhouettes.
      ctx.fillStyle = rgba(PALETTE.ink, 0.30);
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.arc(W * 0.175 + i * (W * 0.022), fy + 8, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // the ruler (a wide slat with tick marks) + the pencil (a tapered
      // stick), hanging from the pegs
      ctx.fillStyle = rgba(PALETTE.gold, 0.46);
      roundRect(ctx, W * 0.180, fy + 14, 150, 26, 5);
      ctx.fill();
      ctx.strokeStyle = rgba(PALETTE.ink, 0.38);
      ctx.lineWidth = 2.5;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(W * 0.180 + i * 24, fy + 14);
        ctx.lineTo(W * 0.180 + i * 24, fy + 22);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(PALETTE.ink, 0.36);
      ctx.beginPath();
      ctx.moveTo(W * 0.360, fy + 16);
      ctx.lineTo(W * 0.360 + 118, fy + 16);
      ctx.lineTo(W * 0.360 + 130, fy + 27);
      ctx.lineTo(W * 0.360 + 118, fy + 38);
      ctx.lineTo(W * 0.360, fy + 38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rgba(PALETTE.gold, 0.52);
      ctx.beginPath();
      ctx.moveTo(W * 0.360 + 118, fy + 16);
      ctx.lineTo(W * 0.360 + 130, fy + 27);
      ctx.lineTo(W * 0.360 + 118, fy + 38);
      ctx.closePath();
      ctx.fill();
    } else if (family === 'survey') {
      // THE POLL RAIL — the survey room: four mini poll bars with tick
      // bases, the chapter's own data-shape as architecture.
      const polls: [number, number, string][] = [
        [0.17, 34, PALETTE.up], [0.28, 22, PALETTE.up],
        [0.39, 30, PALETTE.down], [0.50, 16, PALETTE.ink],
      ];
      polls.forEach(([fx, bh, col]) => {
        const bx = W * fx;
        ctx.fillStyle = rgba(col, 0.44);
        roundRect(ctx, bx, fy + 30 - bh, 26, bh, 5);
        ctx.fill();
        ctx.strokeStyle = rgba(PALETTE.ink, 0.32);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(bx - 6, fy + 30);
        ctx.lineTo(bx + 32, fy + 30);
        ctx.stroke();
      });
    } else if (family === 'machines') {
      // THE PIPE RAIL — the machine room's architecture: a pressure pipe
      // with a valve wheel and a capped end.
      ctx.strokeStyle = rgba(PALETTE.ink, 0.36);
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(W * 0.175, fy + 16);
      ctx.lineTo(W * 0.90, fy + 16);
      ctx.stroke();
      // the pipe's highlight line (the cylinder read)
      ctx.strokeStyle = rgba('#FFFFFF', 0.30);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(W * 0.175, fy + 12);
      ctx.lineTo(W * 0.90, fy + 12);
      ctx.stroke();
      // the valve wheel — a spoked gold wheel on a stem
      const vx = W * 0.30;
      ctx.strokeStyle = rgba(PALETTE.gold, 0.62);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(vx, fy - 6, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3.5;
      for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
        ctx.beginPath();
        ctx.moveTo(vx - Math.cos(a) * 14, fy - 6 - Math.sin(a) * 14);
        ctx.lineTo(vx + Math.cos(a) * 14, fy - 6 + Math.sin(a) * 14);
        ctx.stroke();
      }
      // the capped end
      ctx.fillStyle = rgba(PALETTE.ink, 0.40);
      roundRect(ctx, W * 0.895, fy + 6, 14, 20, 4);
      ctx.fill();
    } else if (family === 'data') {
      // THE RACK RAIL — the data room: six mini rack cells with LED dots,
      // the datacenter's own motif echoed in the room's architecture.
      for (let i = 0; i < 6; i++) {
        const rx = W * 0.175 + i * (W * 0.046);
        ctx.fillStyle = rgba(PALETTE.ink, 0.34);
        roundRect(ctx, rx, fy - 6, 40, 46, 5);
        ctx.fill();
        ctx.fillStyle = rgba(PALETTE.up, 0.62);
        ctx.beginPath();
        ctx.arc(rx + 10, fy + 4, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(PALETTE.gold, 0.62);
        ctx.beginPath();
        ctx.arc(rx + 22, fy + 12, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(PALETTE.ink, 0.30);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx + 6, fy + 24);
        ctx.lineTo(rx + 34, fy + 24);
        ctx.moveTo(rx + 6, fy + 32);
        ctx.lineTo(rx + 34, fy + 32);
        ctx.stroke();
      }
    } else if (family === 'debt') {
      // THE COIN-STACK RAIL — the debt room: descending stacks of coin
      // blocks, the balance draining left to right.
      const stacks: [number, number][] = [[0.17, 5], [0.26, 4], [0.35, 3], [0.44, 2], [0.53, 1]];
      stacks.forEach(([fx, n]) => {
        const bx = W * fx;
        for (let k = 0; k < n; k++) {
          ctx.fillStyle = rgba(PALETTE.gold, 0.52);
          roundRect(ctx, bx, fy + 24 - k * 12, 44, 10, 4);
          ctx.fill();
          ctx.strokeStyle = rgba(PALETTE.ink, 0.34);
          ctx.lineWidth = 2;
          roundRect(ctx, bx, fy + 24 - k * 12, 44, 10, 4);
          ctx.stroke();
        }
      });
    } else if (family === 'odds') {
      // THE ODDS BOARD RAIL — the odds room: percent chips with direction
      // arrows, the bookmaker's board as architecture.
      const chips: [number, string, string][] = [
        [0.17, '1 IN 4', PALETTE.down], [0.34, '72 ODDS', PALETTE.ink],
        [0.52, 'x1.8', PALETTE.up], [0.68, '-3x', PALETTE.down],
      ];
      chips.forEach(([fx, label, col]) => {
        const tx = W * fx;
        ctx.fillStyle = rgba(col, 0.40);
        roundRect(ctx, tx, fy - 10, 118, 36, 9);
        ctx.fill();
        ctx.strokeStyle = rgba(PALETTE.ink, 0.36);
        ctx.lineWidth = 2.5;
        roundRect(ctx, tx, fy - 10, 118, 36, 9);
        ctx.stroke();
        ctx.fillStyle = rgba(PALETTE.ink, 0.62);
        ctx.font = '700 19px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, tx + 59, fy + 15);
      });
    }
    // families 'close' and 'end' keep the clean stage on purpose.
    ctx.restore();
  }
  ctx.restore();
}

/** PHASE 4: the chapter index -> its room-architecture family. The film's
 *  nine chapters map to eight families; close/end keep the clean stage
 *  (their frames are full-bleed compositions that own the wall already). */
export function chapterFamily(chapterIdx: number): string | null {
  return ([
    'market',   // c1 — the market split
    'charts',   // c3 — the charts chapter
    'survey',   // c4 — the survey chapter
    'machines', // c5 — pump / gauge / the machine room
    'data',     // c6 — the datacenter / margins
    'debt',     // c7 — the debt / paradox chapter
    'odds',     // c8 — fund / odds
    null,       // c9 — takeaways / the close: clean stage
    null,       // c10 — the end screen: clean stage
  ] as (string | null)[])[chapterIdx] ?? null;
}

/** Paints the standard scene background: pure white base + breathing wash.
 *  v8: the wash takes a chapter TONE (teal / coral / gold rotation) at a
 *  whisper 3% — a 20-minute film now travels through a color journey
 *  instead of one flat white, while never leaving the light register. */
export function paintBg(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t = 0,
  chapterTone: 'up' | 'down' | 'gold' | 'neutral' = 'neutral'
): void {
  ctx.fillStyle = PALETTE.bgTop;
  // PANEL-9 R6b (top-edge strip defect): paintBg runs under the camera
  // transform, which drifts ±23px and pulls back to 0.974 on comparison
  // scenes — a fillRect(0,0,W,H) under that transform can leave the top /
  // side rows with NO opaque base, and the wash blob + grain then land as
  // semi-transparent warm speckle there (measured alpha 4-47): the
  // "brown-olive band" the re-review panel flagged on recessionGauge, and
  // in the shipped YUV it composites onto black. Bleeding the base fill
  // 96px past the canvas absorbs the entire camera envelope (worst case
  // ≈80px on chartJourney's extra drift); the wash geometry is unchanged.
  ctx.fillRect(-96, -96, W + 192, H + 192);
  const pulse = 0.5 + 0.5 * Math.sin(t / 6000);
  const wash =
    chapterTone === 'up' ? PALETTE.up
    : chapterTone === 'down' ? PALETTE.down
    : chapterTone === 'gold' ? PALETTE.gold
    : PALETTE.up;
  // v8.1 recheck: the first pass shipped 2.8–3.2% and corner probes moved
  // only 1–2/255 — imperceptible, graded NOT_FIXED. v8.1 raised it to
  // ~5% (graded PARTIAL — 'rotation exists but subtle'); v8.2 goes to
  // ~7% peak: unmistakable side-by-side, still gentle in motion, and the
  // frame still reads white. Gold runs quieter than teal/coral (a 7% gold
  // wash reads as cream; 5.8% reads as warm light).
  // v8.2/PANEL-9 R6: 'down' wash trimmed 0.066→0.050 — at 6.6% the coral
  // chapter wash stacked with peach gradients and read as "dirty salmon"
  // in the gasPump/recessionGauge renders (measured on real harness
  // frames, not the palette card). 5% keeps the room-change effect
  // without the mud. Gold and teal hold (they read clean in the same test).
  // P1-6 (report): the wash climbs into the panel's "perceptible" band.
  // The P1 vision round graded 9.6% "clean but a whisper — the band starts
  // ~1 point higher" with "plenty of headroom before the light palette is
  // threatened": teal 0.115 / gold 0.105 / neutral 0.09. Coral goes only to
  // 0.068, NOT 11% — the R6 dirty-salmon finding was a stacking measurement
  // on the peach-gradient scenes, and re-verified probes at 0.068 hold the
  // coral register at pale-peach (hue ~15°, sat ≤ 0.05) — never mud.
  // 100-JUDGE PANEL / Phase 4 item 3 — DEEPEN THE COLOR JOURNEY (report
  // §6 Phase 4, p.18: "Raise the chapter washes from 5-11% to 15-20%
  // with a complementary accent object per chapter (gold K, coral gauge,
  // teal racks). Room changes become narrative events."). The wash climbs
  // into the report's own band: teal 0.19 / gold 0.17 / neutral 0.155 /
  // coral 0.15 (coral stays the quietest — the R6 dirty-salmon ceiling
  // still binds; 0.15 keeps pale-peach, verified against the same
  // peach-gradient stacking scenes). The glow blob pair still breathes
  // on the same 6s clock; the frame still reads light — but a chapter
  // change now lands as a NARRATIVE event, not a whisper.
  // 100-JUDGE AUDIT / fix 6.3: the journey climbs one more audible step —
  // teal 0.215 / gold 0.20 / neutral 0.185 / coral 0.17. Room changes now
  // read as narrative events at the feed; the light register holds.
  const strength =
    chapterTone === 'neutral'
      ? 0.185
      : chapterTone === 'gold'
        ? 0.2
        : chapterTone === 'down'
          ? 0.17
          : 0.215;
  glowBlob(ctx, W * 0.82, H * 0.16 + driftY(t), W * 0.5, wash, strength + 0.012 * pulse);
  glowBlob(ctx, W * 0.1, H * 0.9, W * 0.42, wash, strength * 0.73 + 0.010 * (1 - pulse));
  // PHASE 4 (FEED THUMB-STOP): the stage world — the flat field becomes
  // THE DATA DESK (floor plane + architecture band + desk edge). Painted
  // here so every family inherits it; the family comes from the frame
  // context the director sets per frame. Under the vignette + grain.
  drawStageWorld(ctx, W, H, t);
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
