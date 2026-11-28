/**
 * stage.ts — PHASE 4 (Visual Audit report — FEED THUMB-STOP / premium feel
 * 4.5): "A scrolled viewer sees a mascot, a letter and a big empty field —
 * not a story. The strongest content frames (fundSplit) are the exception,
 * not the system."
 *
 * THE DIAGNOSIS: paintBg laid a flat wash and nothing else — the field a
 * presenter stands in was literally EMPTY. At the 320px feed the film's
 * default frame reduces to figure + letterform + void. fundSplit reads
 * because it owns a full-width structured mass (the 493-household wall);
 * aiDatacenter reads because of its rack field; splitNumbers because of
 * the household band. Those scenes were the exception.
 *
 * THE SYSTEM (this module — called from paintBg, so EVERY scene inherits
 * it): the film is THE DATA DESK, so the empty field becomes THE DESK —
 * a three-plane stage world that survives the 320px gate BY CONSTRUCTION
 * (every element is a large-area structure ≥ 60px at 1080 → ≥ 10px at the
 * feed; the inverse of the Phase 3 furniture whitelist, which deleted
 * sub-gate decoration — this layer only admits gate-surviving structure):
 *
 *   1. THE FLOOR PLANE — a soft horizon band + the desk surface's tone
 *      shift + perspective floor lines. The presenter STANDS ON a ground;
 *      the frame gains a horizon (the deepest depth cue a 2D stage has).
 *   2. THE ARCHITECTURE BAND — large vertical mullion silhouettes in the
 *      upper field: the studio wall behind every scene. Tuned per family:
 *      host 4 mullions, data 3 (quieter — the data owns the frame),
 *      statement 2 whispers (the type owns the frame).
 *   3. THE DESK EDGE — a soft foreground rail at the frame's foot: the
 *      camera looks OVER a desk edge, which grounds the composition.
 *
 * VALUE DISCIPLINE (the Phase 3 value-structure rule holds): every alpha
 * sits at 3-12% ink-on-field — the architecture NEVER forms a competing
 * dark mass or bright mass; it is structure, not content. Scrub-safe:
 * every position is a pure function of (W, H) and a family-seeded hash —
 * no per-frame randomness.
 */

import { rgba, PALETTE, roundRect } from './theme';
import { hash01 } from './easing';
import { frameContext, type FrameFamily } from './composition';

/** per-family stage tuning: [horizonY, mullionCount, mullionAlpha, floorAlpha] */
// U9 (market review Table 5 — FILL THE EMPTY FIELDS INSIDE THE VALUE
// DISCIPLINE): the 3-12% ink alphas were tuned for texture and landed
// sub-perceptual on a mid-tone field — the floor planes, mullions and desk
// edge carried ~half the band's weight. Every alpha rises ~1.8x, CAPPED at
// the band's 12% top so the architecture stays structure, never a
// competing mass. Same geometry, same counts — the room finally reads.
const STAGE_TABLE: Record<FrameFamily, {
  horizonY: number;      // fraction of H where the desk begins
  mullions: number;      // how many wall verticals
  mullionAlpha: number;  // the wall band's alpha ceiling
  floorAlpha: number;    // the desk surface's darkening
  floorLines: number;    // perspective lines on the desk surface
}> = {
  // U-07 (VISUAL MARKET REVIEW — THE TWO-MASS LAW): the 0.099-0.12 register
  // was sub-perceptual on the sweep sheets — the room read as a flat wash
  // and most frames reduced to figure + card + void. The architecture band
  // rises to 0.17-0.20 and the floor plane to 0.14-0.17: the room READS at
  // the feed while staying structure (no band approaches a competing mass;
  // the figure's ink and the content plates still own the value extremes).
  host:      { horizonY: 0.70, mullions: 4, mullionAlpha: 0.20,  floorAlpha: 0.17, floorLines: 4 },
  data:      { horizonY: 0.72, mullions: 3, mullionAlpha: 0.17,  floorAlpha: 0.14, floorLines: 3 },
  statement: { horizonY: 0.74, mullions: 2, mullionAlpha: 0.17,  floorAlpha: 0.15, floorLines: 3 },
};

/**
 * SCENE OVERRIDES — scenes that own their own ground system keep the
 * stage's atmosphere (wall bands, tone shift) but surrender the stage's
 * perspective floor lines: aiDatacenter draws its own perspective grid,
 * gasPump forks its two-roads diagram across the desk, splitNumbers
 * grounds the household band. Two floor systems on one desk is a
 * double-exposure — the scene's ground WINS, the stage yields.
 */
const STAGE_SCENE_OVERRIDES: Record<string, Partial<{ floorLines: number; floorAlpha: number; horizonY: number }>> = {
  aiDatacenter: { floorLines: 0, floorAlpha: 0.018 },
  gasPump: { floorLines: 0 },
  splitNumbers: { floorLines: 2, floorAlpha: 0.03 },
};

export function drawStageWorld(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number
): void {
  const family = frameContext().family;
  const sceneType = frameContext().sceneType;
  const ov = STAGE_SCENE_OVERRIDES[sceneType] ?? {};
  const base = STAGE_TABLE[family];
  const st = {
    horizonY: ov.horizonY ?? base.horizonY,
    mullions: base.mullions,
    mullionAlpha: base.mullionAlpha,
    floorAlpha: ov.floorAlpha ?? base.floorAlpha,
    floorLines: ov.floorLines ?? base.floorLines,
  };
  const horizonY = H * st.horizonY;
  const ink = PALETTE.inkDeep;

  // ── 1. THE FLOOR PLANE ────────────────────────────────────────────────
  // the desk surface darkens gently below the horizon — a large-area tone
  // shift that survives the feed trivially and gives every figure a GROUND
  let g = ctx.createLinearGradient(0, horizonY - H * 0.02, 0, H);
  g.addColorStop(0, rgba(ink, 0));
  g.addColorStop(0.28, rgba(ink, st.floorAlpha * 0.55));
  g.addColorStop(1, rgba(ink, st.floorAlpha));
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY - H * 0.02, W, H - horizonY + H * 0.02);
  // the horizon band — a soft 18px gradient crest (never a hard line: at
  // the 320px gate a 3px rule is half a pixel; a band is a PLANE)
  g = ctx.createLinearGradient(0, horizonY - H * 0.016, 0, horizonY + H * 0.004);
  g.addColorStop(0, rgba(ink, 0));
  g.addColorStop(0.6, rgba(ink, st.floorAlpha * 1.8));
  g.addColorStop(1, rgba(ink, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY - H * 0.016, W, H * 0.02);
  // perspective floor lines — soft, ≥10px, converging to the vanishing
  // point under the frame centre (the aiDatacenter floor grammar,
  // generalised to every family's stage)
  const vpx = W * 0.5;
  const vpy = horizonY;
  ctx.strokeStyle = rgba(ink, st.floorAlpha * 1.25);
  ctx.lineWidth = Math.max(8, W * 0.005);
  for (let i = 0; i < st.floorLines; i++) {
    const spread = 0.28 + hash01(i * 7.3 + 11) * 0.9;    // deterministic x at the frame foot
    const footX = W * (0.06 + spread * 0.88);
    ctx.beginPath();
    ctx.moveTo(vpx + (footX - vpx) * 0.18, vpy + H * 0.008);
    ctx.lineTo(footX, H);
    ctx.stroke();
  }

  // ── 2. THE ARCHITECTURE BAND ──────────────────────────────────────────
  // the studio wall behind every scene: large vertical mullion bands in
  // the upper field. Widths 90-160px (≥15px at the feed), deterministic
  // placement, alpha below the mass threshold — structure, never content.
  const bandTop = H * 0.10;
  const bandBottom = horizonY - H * 0.03;
  for (let i = 0; i < st.mullions; i++) {
    const u = hash01(i * 13.7 + 3);
    const wBand = W * (0.05 + hash01(i * 5.1 + 29) * 0.035);
    const x = W * (0.10 + u * 0.80) - wBand / 2;
    // a gentle vertical gradient: the band fades in from its top and out
    // at its foot — it reads as light falling between mullions
    const a = st.mullionAlpha * (0.75 + hash01(i * 3.3) * 0.5);
    const breathe = Math.sin(t / 7000 + i * 2.1) * 0.012;   // slow, cinematic
    g = ctx.createLinearGradient(0, bandTop, 0, bandBottom);
    g.addColorStop(0, rgba(ink, 0));
    g.addColorStop(0.35, rgba(ink, Math.max(0, a + breathe)));
    g.addColorStop(0.85, rgba(ink, a * 0.5));
    g.addColorStop(1, rgba(ink, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, bandTop, wBand, bandBottom - bandTop);
  }

  // ── 3. THE DESK EDGE ──────────────────────────────────────────────────
  // the frame's foot: a soft foreground rail the camera looks over
  g = ctx.createLinearGradient(0, H - H * 0.075, 0, H);
  g.addColorStop(0, rgba(ink, 0));
  g.addColorStop(1, rgba(ink, st.floorAlpha * 1.6));
  ctx.fillStyle = g;
  ctx.fillRect(0, H - H * 0.075, W, H * 0.075);
}

/**
 * U-07 (VISUAL MARKET REVIEW — THE FOREGROUND PLANE): the third depth plane
 * IN FRONT of the content. A near desk-edge plank runs along the frame's
 * foot (a rounded plank bleeding off the right edge, one edge highlight and
 * a leg tick) — the camera visibly looks OVER a desk, the deepest and
 * cheapest depth cue a flat stage has. Screen-space, drawn AFTER the scene
 * drawer from director's post pass, so it sits in front of figure and data
 * alike. Geometry is a pure function of (W, H) — scrub-safe; the band
 * (y >= H-36) sits below every registered content lane (source tags bottom
 * ~1032, caption zone above 800), so it plates nothing.
 */
export function drawForegroundPlane(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number
): void {
  const ink = PALETTE.inkDeep;
  const plankY = H - 34;
  // the plank — a soft ink mass with a lit top edge (left end rounded, the
  // right end bleeds off the frame)
  const g = ctx.createLinearGradient(0, plankY, 0, H);
  g.addColorStop(0, rgba(ink, 0.20));
  g.addColorStop(1, rgba(ink, 0.30));
  ctx.fillStyle = g;
  roundRect(ctx, W * 0.40, plankY, W * 0.60 + 40, H - plankY, 12);
  ctx.fill();
  // the lit top edge — the desk's near rail catches the key light
  ctx.strokeStyle = rgba(PALETTE.white, 0.20);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W * 0.40 + 12, plankY + 1.5);
  ctx.lineTo(W, plankY + 1.5);
  ctx.stroke();
}
