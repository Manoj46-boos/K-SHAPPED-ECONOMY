/**
 * Stickman v2 — the "premium ink" rendering upgrade (PATCH 3).
 *
 * v1 limbs were constant-width strokes: clean, but flat — like vector clip
 * art rather than drawn animation. v2 gives every limb a tapered polygon
 * (thick at the joint, thin at the extremity) with round caps, small hand
 * discs, rounded shoes, a two-layer radial ground shadow with a short gold
 * "stage" line, eye glints, and subtle cheek warmth.
 *
 * Skeletal math is 100% unchanged — poses still come from Stickman.poseAt,
 * so every existing scene, walk cycle and gesture blend keeps working.
 * Zero new dependencies. drawStickmanV2 is a drop-in for drawStickman at
 * any call site.
 *
 * AUDIT-2 (the 100-judge panel report) applied on top:
 *  §10.1/0.1 far limbs draw in occlusion INK (a value step), never alpha;
 *  §10.1/0.2 the blink runs a raised-cosine curve, not a step;
 *  §10.1/0.6 the mouth has four shapes keyed to the talk envelope;
 *  §10.2/1.1 LINE BOIL — endpoints jitter on a 3-phase 10Hz clock;
 *  §10.2/1.2 the expression rig: eyelids, brow shapes, pupil dilation;
 *  §10.2/1.3 mitten hand glyph below rig scale 1.0;
 *  §10.2/1.4 a collar break separates head from scarf;
 *  §10.3 foreground parallax factor 0.25 → 0.40 (D1);
 *  §8/C4 stroke weights + face features sized to survive the 320px feed.
 */

import { PALETTE, rgba, roundRect, hexLerp } from './theme';
import { clamp, clamp01, hash01 } from './easing';
import { registerRect } from './collision';
import { camState } from './effects';
import { AMP, INK } from './perception';

const D2R = Math.PI / 180;

const lerp2 = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * v3 (panel P0-4) — deterministic talk envelope: max mouth openness across
 * words near local time t. `wordTimes` are ms-local to the beat — the same
 * array SceneCtx already carries for caption sync and head nods, so routing
 * it to the mouth costs nothing. Rise fast / fall slow reads as
 * articulation; between sentences the mouth returns to the smile/neutral
 * line. Pure function of t — scrub-determinism preserved.
 */
export function talkAt(t: number, wordTimes: number[]): number {
  let open = 0;
  for (const wt of wordTimes) {
    const a = t - wt;
    if (a >= -20 && a <= 260) {
      const p = a < 0 ? 0 : a / 260;
      const env = Math.sin(Math.PI * Math.min(1, p * 1.15));
      open = Math.max(open, env);
    }
    if (wt > t + 300) break;
  }
  return open;
}

/**
 * 100-JUDGE AUDIT (Part 8.2 — PRESTON BLAIR 9-SHAPE MOUTH). The shipped
 * 4-shape system (closed / small-open / wide-open / round-O) cannot carry
 * speech — premium lip sync needs at minimum the 9 Preston-Blair visemes:
 *   A (closed, MBP), B (slightly open, KST), C (open, EH), D (wide, FV),
 *   E (rounded, OW), F (pursed, UW), G (teeth-on-lip, TH), H (open wide, AH),
 *   X (rest). The engine already receives word-level timing (wordTimes) for
 * caption sync. This viseme estimator maps the active word's first letter
 * (cheap, no library) to a viseme shape. Pure function of (t, wordTimes,
 * words) — scrub-determinism preserved.
 */
export type Viseme = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';

const VISIEME_BY_FIRST_LETTER: Record<string, Viseme> = {
  b: 'A', m: 'A', p: 'A',                    // bilabial (closed)
  k: 'B', s: 'B', t: 'B', g: 'B', z: 'B', c: 'B',  // velar/alveolar (slightly open)
  e: 'C', a: 'C',                            // front vowel (open)
  f: 'D', v: 'D',                            // labiodental (wide)
  o: 'E',                                    // rounded back (OW)
  u: 'F', w: 'F',                            // rounded high (UW)
  i: 'H', y: 'H',                            // open back (AH)
};

export function visemeAt(t: number, wordTimes: number[], words: string[]): Viseme {
  let activeIdx = -1;
  for (let i = 0; i < wordTimes.length; i++) {
    if (wordTimes[i] <= t && t < wordTimes[i] + 280) activeIdx = i;
    if (wordTimes[i] > t + 50) break;
  }
  if (activeIdx < 0 || activeIdx >= words.length) return 'X';
  const w = words[activeIdx].toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 'X';
  if (w.startsWith('th')) return 'G';
  if (w.startsWith('sh') || w.startsWith('ch')) return 'B';
  if (w.startsWith('oo')) return 'F';
  const v = VISIEME_BY_FIRST_LETTER[w[0]];
  return v ?? 'X';
}

/**
 * v3 mouth (panel P0-4) — when `talk` is high the mouth becomes an open,
 * articulate jaw (dark rounded interior + ivory teeth/tongue hint so it
 * stays light); otherwise the v2 smile/neutral line. The v1/v2 static
 * curve mouth ran for ~18 of ~21 minutes of speech — the single biggest
 * character-liveliness loss in the panel review.
 */
function drawMouthV2(
  ctx: CanvasRenderingContext2D,
  eyeDX: number,
  smile: number,
  talk: number,
  /** BLUEPRINT Phase 2: jaw multiplier for the reaction beats — the
   *  shock pose drives a 2x jaw opening (a gasp reads at distance; a
   *  polite 4px ellipse does not). 1 = normal speech. */
  jawX = 1,
  /** P1-1 (audit Table 3): mouth ink — '#FFFFFF' on the becker solid
   *  head, PALETTE.ink everywhere else. */
  col: string = PALETTE.ink,
  /** AUDIT-ROUND-2 (fix 9 — FACE FLOOR AT SCALE): true when the figure
   *  draws above rig scale 1.5 — the mouth's minimum width lifts to
   *  12px so the speaking mouth survives the 320px gate next to the
   *  enlarged eyes (a 7px-wide ellipse reads as a pinhole at feed
   *  scale). */
  bigFace = false,
  /** 100-JUDGE AUDIT (Part 8.2): the Preston Blair viseme shape. When
   *  provided, the mouth uses the 9-shape system instead of the 4-shape
   *  envelope. 'X' = rest (no viseme — falls back to envelope). */
  viseme: Viseme = 'X'
): void {
  // AUDIT-ROUND-2 (fix 9): the width floor — 12px minimum in the
  //  face-floor regime, scaled smoothly below it.
  const wFloor = bigFace ? 12 : 7;
  const mx = eyeDX * 0.6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = col;

  // 100-JUDGE AUDIT (Part 8.2): when a viseme is active and the talk
  // envelope is above the small-open threshold, use the 9-shape Preston
  // Blair system; otherwise fall back to the 4-shape envelope (back-compat).
  if (viseme !== 'X' && talk > 0.15) {
    const w = Math.max(wFloor, 6 + talk * 4);
    const h = (2.5 + talk * 6.5) * jawX;
    const teethCol = '#FDFCF8';
    switch (viseme) {
      case 'A': // closed (MBP) — flat line, slightly compressed
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(mx - w * 0.7, 15);
        ctx.lineTo(mx + w * 0.7, 15);
        ctx.stroke();
        return;
      case 'B': // slightly open (KST) — small horizontal slot
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(mx, 15, w * 0.7, h * 0.35 * jawX, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      case 'C': // open (EH) — wide mid-height ellipse
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(mx, 15, w, h * 0.7 * jawX, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = teethCol;
        ctx.beginPath();
        ctx.ellipse(mx, 15 - h * 0.3, w * 0.55, h * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      case 'D': // wide (FV) — wide low ellipse with teeth
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(mx, 15, w * 1.1, h * 0.5 * jawX, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = teethCol;
        ctx.beginPath();
        ctx.ellipse(mx, 15 - h * 0.18, w * 0.6, h * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      case 'E': // rounded (OW) — vertical ellipse, taller than wide
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(mx, 15, w * 0.6, h * 0.85 * jawX, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = teethCol;
        ctx.beginPath();
        ctx.ellipse(mx, 15 - h * 0.35, w * 0.35, h * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      case 'F': // pursed (UW) — small tight circle
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(mx, 15, w * 0.45, h * 0.5 * jawX, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      case 'G': // teeth-on-lip (TH) — slot with teeth bar
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(mx, 15, w * 0.8, h * 0.4 * jawX, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = teethCol;
        ctx.fillRect(mx - w * 0.6, 14, w * 1.2, 2.5);
        return;
      case 'H': // open wide (AH) — wide tall ellipse, full jaw drop
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(mx, 15, w * 0.9, h * 1.1 * jawX, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = teethCol;
        ctx.beginPath();
        ctx.ellipse(mx, 15 - h * 0.45, w * 0.5, h * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        return;
      case 'X':
        break; // fall through to the 4-shape envelope
    }
  }

  // AUDIT-2 / 0.6 (report §10.1, C2): the FOUR-SHAPE mouth (original envelope).
  // two-state system (smile arc | one open ellipse) flapped; these
  // thresholds (0.18 / 0.55 / 0.85) carve the SAME talk envelope into
  // closed / small-open / wide-open / round-O shapes — articulation
  // from data the engine already receives.
  if (talk > 0.85) {
    // the round "O" — peak openness: taller than wide, reads at distance
    const w = Math.max(wFloor + 2, 6.5 + (talk - 0.85) * 12);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(mx, 15, w, w * 1.3 * jawX, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FDFCF8';
    ctx.beginPath();
    ctx.ellipse(mx, 15 - w * 0.55 * jawX, w * 0.5, w * 0.24 * jawX, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (talk > 0.55) {
    // wide-open articulate jaw (the v3 shape, retuned)
    const w = Math.max(wFloor, 7.5 + talk * 3);
    const h = (4 + (talk - 0.55) * 16) * jawX;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(mx, 15, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FDFCF8';
    ctx.beginPath();
    ctx.ellipse(mx, 15 - h * 0.45, w * 0.55, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (talk > 0.18) {
    // small-open — mid-energy speech: a modest rounded opening
    const w = Math.max(wFloor - 1, 6 + talk * 4);
    const h = (2.5 + talk * 6.5) * jawX;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(mx, 15, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FDFCF8';
    ctx.beginPath();
    ctx.ellipse(mx, 15 - h * 0.45, w * 0.55, h * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (smile > 0.05) {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-8 + mx, 14);
    ctx.quadraticCurveTo(mx, 14 + smile * 10, 8 + mx, 14);
    ctx.stroke();
  } else {
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-6 + mx, 15);
    ctx.lineTo(6 + mx, 15);
    ctx.stroke();
  }
}

// ── AUDIT-2 / 1.1 (report §10.2): LINE BOIL ─────────────────────────────────
// The cheapest "premium ink" upgrade available to a deterministic canvas
// engine: a 3-phase boil clock at 10Hz (one phase every 100ms — animation
// "on threes" at 30fps), every limb endpoint jittered ±0.8px by a hash
// keyed on (joint, phase). Clean vectors read as puppets; boiling ink
// reads as drawn. Scrub-determinism survives because the jitter is a pure
// function of QUANTIZED time.
const BOIL_MS = 100;
let boilT = -1; // set per drawStickmanV2 call; -1 disables (direct taper() calls)
let boilJoint = 0; // per-draw joint counter so each joint boils independently
// P2-6 (100-judge audit, Table 4 — THE MOTION-SCALED BOIL): the audit's
// §5.2 law — "quiet poses boil on threes at the full 4.5px, but statement
// frames and fast gestures drop to on-twos at half amplitude... Type
// should never boil; only ink boils." At 30fps the 10Hz 3-phase boil can
// STROBE at the phone gate (the downsample leaves ~1.4px of wobble —
// flicker reads as compression artifacts). The register now scales:
//   boilFast (set per draw when the figure is mid-gesture-spring, smear
//   > 0.45): ON-TWOS at HALF amplitude — the trail carries the motion,
//   the jitter must not fight it;
//   boilQuiet (statement frames — the director's calm plates): on-twos
//   at half amplitude too (the typography already carries no boil; the
//   figure calm beside it reads composed, not frozen).
let boilFast = false;
function boilReset(t: number, fast = false): void {
  boilT = t;
  boilJoint = 0;
  boilFast = fast;
  // 100-JUDGE AUDIT (Part 8.3): reset the line-texture joint counter too,
  // so each draw call cycles through the 6 variations deterministically.
  lineTexReset();
}
function boilOff(): { dx: number; dy: number } {
  if (boilT < 0) return { dx: 0, dy: 0 };
  // P2-6: quiet = on-threes (3 phases, full amplitude); fast = on-twos
  // (2 phases), half amplitude.
  const mod = boilFast ? 2 : 3;
  const amp = (boilFast ? 0.5 : 1) * AMP.boilPx;
  const phase = Math.floor(boilT / BOIL_MS) % mod;
  const j = boilJoint++;
  // BLUEPRINT Phase 1 (AMP.boilPx): ±0.85 -> ±2.2 px — the drawn-ink
  // wobble must survive the 6x downscale to the 320px feed; at ±0.85 it
  // was 0.22px there, i.e. a clean vector, i.e. a puppet.
  return {
    dx: (hash01(j * 17.31 + phase * 7.7) - 0.5) * amp * 2,
    dy: (hash01(j * 29.7 + phase * 11.3 + 5) - 0.5) * amp * 2,
  };
}

// 100-JUDGE AUDIT (Part 8.3 — HAND-DRAWN LINE TEXTURE). The boil alone is
// uniform — every joint jitters by the same amplitude distribution, so the
// eye reads "rendered" instead of "drawn". Real hand-drawn animation has
// line texture that VARIES: some strokes are heavier, some are lighter,
// some have a flick at the end. The fix: 6 pre-baked stroke-weight
// variations per limb segment, cycled deterministically by (joint, phase).
// Each variation multiplies the limb's w0/wJ/w1 taper widths by a slightly
// different factor (0.92, 0.96, 1.00, 1.04, 1.08, 0.98) so the line weight
// itself varies per frame — the audience reads "a hand drew each frame"
// without knowing why. Pure function of (joint, quantized time).
const LINE_TEX_VARIATIONS = [0.92, 0.96, 1.00, 1.04, 1.08, 0.98];
function lineTexScale(jointIdx: number): number {
  if (boilT < 0) return 1;
  const phase = Math.floor(boilT / BOIL_MS);
  const idx = (jointIdx * 7 + phase) % LINE_TEX_VARIATIONS.length;
  return LINE_TEX_VARIATIONS[(idx + LINE_TEX_VARIATIONS.length) % LINE_TEX_VARIATIONS.length];
}
let lineTexJoint = 0;
function lineTexReset(): void { lineTexJoint = 0; }
function lineTexNext(): number { return lineTexScale(lineTexJoint++); }

/** Tapered quad stroke with round caps — the "premium ink" line. */
export function taper(
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

/** Two-bone tapered limb ending in a hand disc. Returns the hand position.
 *  AUDIT-2 / 1.1: elbow and hand endpoints carry line-boil jitter (see
 *  boilOff) — the drawn-ink wobble, keyed to quantized time.
 *  AUDIT-2 / 1.5: optional `lift` (px, up) offsets the extremity — the
 *  walk's swing-foot arc rides it (zero at contacts, peak mid-swing). */
export function limb2(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  aUpper: number, aLower: number,
  lenU: number, lenL: number,
  w0: number, wJ: number, w1: number,
  col: string,
  lift = 0
): { ex: number; ey: number } {
  const mx = x + Math.sin(aUpper * D2R) * lenU;
  const my = y + Math.cos(aUpper * D2R) * lenU;
  let ex = mx + Math.sin(aLower * D2R) * lenL;
  let ey = my + Math.cos(aLower * D2R) * lenL - lift;
  const b1 = boilOff();
  const b2 = boilOff();
  const jx = mx + b1.dx, jy = my + b1.dy;
  ex += b2.dx; ey += b2.dy;
  // 100-JUDGE AUDIT (Part 8.3 — HAND-DRAWN LINE TEXTURE): each limb segment
  // picks up a slightly different stroke weight from the 6-variation cycle,
  // so the line itself reads as "drawn by hand" instead of "rendered".
  const t0 = lineTexNext();
  const t1 = lineTexNext();
  taper(ctx, x, y, jx, jy, w0 * t0, wJ * t0, col);
  taper(ctx, jx, jy, ex, ey, wJ * t1, w1 * t1, col);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(ex, ey, w1 * 0.72 * t1, 0, Math.PI * 2);
  ctx.fill();
  return { ex, ey };
}

/**
 * PANEL-12 / P0-2 (report §12.2) — REAL HANDS on both arms.
 *
 * P1-7 (report §12.7): TAPERED 3-FINGER FAN + OPPOSED THUMB at hero scale.
 * AUDIT-2 / 1.3 (report §10.2, C5): TWO GLYPHS. The fan reads as a hand
 * from scale ~1.0 up; below it the judges read "three-finger twig
 * bursts" / "a withered claw" — one glyph cannot work across a 2× scale
 * range. Below rig scale 1.0 the hand renders as the MITTEN: a rounded
 * palm mass plus the opposed thumb — the silhouette of a hand at small
 * scale, where individual fingers are sub-feed-pixel anyway.
 */
type HandMode = 'fist' | 'count1' | 'count2' | 'count3' | undefined;

function handGlyph(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,          // hand position from limb2()
  forearmAngle: number,          // the pose's lower-arm angle, degrees
  s: number, col: string,        // glyph size unit (16 near / 12 far at the call sites)
  rigScale = 1,                  // P1-2 r3: the figure's rig scale — picks the glyph tier
  mode: HandMode = undefined     // P1-2: explicit glyph override (fist / countN)
): void {
  const a = forearmAngle * D2R;
  // P1-2 (100-judge audit, Table 3 — HANDS): the FIST + COUNT glyphs.
  // "Featureless mitts in every pose" / "a withered claw" — and the
  // count poses had nothing to count WITH. The fist: a rounded mass + a
  // thumb bar; countN: the same fist with N fingers extended — a hand
  // that literally counts, at any scale.
  if (mode === 'fist' || mode === 'count1' || mode === 'count2' || mode === 'count3') {
    const n = mode === 'fist' ? 0 : Number(mode.slice(5));
    ctx.save();
    ctx.translate(x + Math.sin(a) * s * 0.1, y + Math.cos(a) * s * 0.1);
    ctx.rotate(a);
    ctx.fillStyle = col;
    roundRect(ctx, -s * 0.4, -s * 0.32, s * 0.8, s * 0.74, s * 0.28);
    ctx.fill();
    ctx.restore();
    // the N extended fingers — splayed ±0.34 rad, rooting past the knuckles
    for (let f = 0; f < n; f++) {
      const off = (f - (n - 1) / 2) * 0.34;
      taper(ctx, x + Math.sin(a) * s * 0.16, y + Math.cos(a) * s * 0.16,
        x + Math.sin(a + off) * s * 1.04, y + Math.cos(a + off) * s * 1.04,
        s * 0.3, s * 0.14, col);
    }
    // the thumb bar across the fist — the closed-hand read
    taper(ctx, x + Math.sin(a) * s * 0.06, y + Math.cos(a) * s * 0.06,
      x + Math.sin(a + 1.15) * s * 0.52, y + Math.cos(a + 1.15) * s * 0.52,
      s * 0.28, s * 0.15, col);
    return;
  }
  // ── THE BOLD MITT (everything below true hero scale) ──
  // AUDIT-ROUND-2 (fix 8 — HANDS: COMMIT): the three-tier system
  // (mitten < 0.85 / bold mitt 0.85-2.0 / fan ≥ 2.0) failed in its middle
  // band — exactly where the side hosts and the editorial host live. The
  // panel: "both hands are mitten blobs with uneven finger nubs — the
  // pointing hand reads as a slightly torn glove... a raster accident, not
  // a design choice." ONE committed silhouette below rig 2.0 now: a WIDER
  // palm (1.9s × 2.2s, generous radii) with a V-NOTCH thumb whose visible
  // gap reads as anatomy — rooted just inside the palm's edge and exiting
  // steeply outward so background cuts a real V between thumb and palm.
  // The articulated fan still waits for true hero scale (≥ 2.0).
  // Panel round 2: the far hand (glyph s 12) rendered FAN fingers that the
  // re-review read as "thin uneven nubs" — at 12 units no interior anatomy
  // survives. The mitt now owns every glyph smaller than s 15 too; the fan
  // only at TRUE hero scale — rig >= 2.0 AND a glyph that can carry fingers.
  if (rigScale < 2.0 || s < 15) {
    ctx.save();
    ctx.translate(x + Math.sin(a) * s * 0.5, y + Math.cos(a) * s * 0.5);
    ctx.rotate(a);
    ctx.fillStyle = col;
    roundRect(ctx, -s * 0.95, -s * 1.1, s * 1.9, s * 2.2, s * 0.62);
    ctx.fill();
    ctx.restore();
    // the THUMB — thick at the base, rooted at the palm's lower corner and
    // exiting past it at a steep ~44°: the V-gap reads as a notch (a
    // HAND), never as a tear. Panel round-5 geometry, doubled clearance.
    ctx.save();
    ctx.translate(x + Math.sin(a) * s * 0.5, y + Math.cos(a) * s * 0.5);
    ctx.rotate(a);
    taper(ctx, s * 0.55, -s * 0.6, s * 1.62, -s * 1.42, s * 0.66, s * 0.32, col);
    ctx.restore();
    return;
  }
  // ── the FAN (true hero scale ≥ 2.0) ──
  // P1-2 (100-judge audit, Table 3) panel round 2: the round-1 palm
  // ELLIPSE hid under the finger roots — invisible at side-host scale
  // ("the hand is essentially identical to before"). The palm is now a
  // WEDGE — a filled trapezoid from the WRIST (±0.16s) to the KNUCKLE
  // line (±0.40s, rounded), its flaring edges breaking OUT of the arm's
  // silhouette so the mass reads at 320px — and the glyph itself grows
  // (call sites pass s 13 → 16 near / 10 → 12 far). Each finger roots
  // at its OWN point along the knuckle arc: a hand, not a claw.
  const nx = Math.sin(a + Math.PI / 2);
  const ny = Math.cos(a + Math.PI / 2);
  const wx = x + Math.sin(a) * s * 0.02;
  const wy = y + Math.cos(a) * s * 0.02;
  const kx = x + Math.sin(a) * s * 0.36;
  const ky = y + Math.cos(a) * s * 0.36;
  // the palm wedge — wrist-narrow, knuckle-wide
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(wx - nx * s * 0.16, wy - ny * s * 0.16);
  ctx.lineTo(kx - nx * s * 0.4, ky - ny * s * 0.4);
  ctx.quadraticCurveTo(
    kx + Math.sin(a) * s * 0.12, ky + Math.cos(a) * s * 0.12,
    kx + nx * s * 0.4, ky + ny * s * 0.4
  );
  ctx.lineTo(wx + nx * s * 0.16, wy + ny * s * 0.16);
  ctx.closePath();
  ctx.fill();
  // the fingers — each rooted at its own point on the knuckle arc
  const fingers: Array<[number, number, number]> = [
    [-0.5, 0.92, 0.95], [-0.12, 1.14, 1.1], [0.28, 0.96, 1.0],
  ];
  for (const [off, len, wid] of fingers) {
    const rx = kx + nx * off * s * 0.52;
    const ry = ky + ny * off * s * 0.52;
    taper(ctx, rx, ry, rx + Math.sin(a + off * 0.55) * s * len,
      ry + Math.cos(a + off * 0.55) * s * len, s * 0.6 * wid, s * 0.2 * wid, col);
  }
  // the OPPOSED thumb — rooted at the wrist-side of the palm, ~75°
  // against the fan, thick at the base: the pincer that makes "holding"
  // readable
  taper(ctx, wx + nx * s * 0.12, wy + ny * s * 0.12,
    wx + nx * s * 0.12 + Math.sin(a - 1.3) * s * 0.66,
    wy + ny * s * 0.12 + Math.cos(a - 1.3) * s * 0.66, s * 0.52, s * 0.2, col);
}

/**
 * PANEL-12 / P0-4 (report §12.4) — the scarf becomes FABRIC.
 *
 * AUDIT-ROUND-2 (fix 7 — SCARF AS ONE RIBBON): the two-layer offset pair
 * (ribbon(0,+3,under) over ribbon(+3,0,top)) — the fake two-tone
 * underside — rendered as visible parallel seams; the panel read them as
 * "overlapping translucent gold rectangles with visible seam edges… a
 * rendering glitch rather than draped cloth" and elsewhere "bandana
 * clip-art, zero folds". ONE continuous tapered ribbon now (6.5 root →
 * 5.0 fold → 2.8 tip full widths, round caps at every joint), ONE fold
 * crease at the fold point (the only seam a real scarf has), ONE
 * under-shadow stroke where the tail passes under the knot's edge. The
 * two-tone underside survives as the crease + under-shadow — fabric over
 * fabric — never as an offset ghost pair.
 */
function scarfTail(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,        // below the knot
  wave: number,                  // the existing Math.sin(t / 700 + seed) * 6
  colTop: string, colUnder: string
): void {
  const fxp = x0 - 8 + wave;            // the fold point (~55% out)
  const fyp = y0 + 42;
  const ex = x0 - 24 + wave * 1.5;     // the tail end, past the fold
  const ey = y0 + 78;
  // ONE continuous tapered ribbon — root segment then fold segment,
  // round caps at the fold so the crease reads as cloth bending.
  // Panel round 2: the tail crosses the gold torso band and the two gold
  // masses MERGED ("a separate parallel strip crossing the scarf"). The
  // ribbon now carries its own DRAWN EDGE — a goldDeep under-taper 1.6px
  // wider on each side — so the cloth reads as cloth LAYERED OVER the band,
  // never as one blob with seams.
  taper(ctx, x0, y0, fxp, fyp, 14.6, 11.6, colUnder);
  taper(ctx, fxp, fyp, ex, ey, 11.6, 7.2, colUnder);
  taper(ctx, x0, y0, fxp, fyp, 13, 10, colTop);
  taper(ctx, fxp, fyp, ex, ey, 10, 5.6, colTop);
  // the fold crease — the one seam a real scarf HAS (the two-tone hint
  // at the bend, in the under colour)
  ctx.strokeStyle = rgba(colUnder, 0.85);
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fxp - 5.5, fyp - 2);
  ctx.lineTo(fxp + 5.5, fyp + 2);
  ctx.stroke();
  // the under-shadow — the tail's root passing under the knot's edge
  // (fabric over fabric, grounded). Panel round 2: alpha 0.6 → 0.42,
  // width 3.2 → 2.4, shortened to the root third — the audit-round-2 judge
  // read the old stroke as "a translucent horizontal band crossing as a
  // fully separate parallel strip"; a shading HINT now, never a second
  // ribbon.
  ctx.strokeStyle = rgba(colUnder, 0.42);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x0 - 4.5, y0 + 10);
  ctx.quadraticCurveTo(x0 - 10 + wave * 0.3, y0 + 20, x0 - 7 + wave * 0.4, y0 + 30);
  ctx.stroke();
}

/**
 * v2 ground shadow — layered radial (contact core + ambient ring) + a short
 * gold "stage" line. Replaces the single flat ellipse.
 * PANEL-12 / P3-3: the soft ellipse offsets (−4, 0) — the ONE-LIGHT rule
 * (light from upper right, every shadow in the film falls lower-left).
 * PANEL-12 / P3-2: `skewX` lets perspective-floor scenes (aiDatacenter)
 * shift the soft ellipse toward the floor's vanishing point so the host
 * stands IN the room's perspective, not on a decal. The contact core and
 * stage line stay under the feet.
 * AUDIT-ROUND-2 (fix 22 — CONTACT CORE): the old radial peaked at 0.30 —
 * the panel twice read the figure as FLOATING ("feet slightly float
 * above the gold ellipse"). The K's shadow language arrives for the
 * character too: a TIGHTER core (0.45 alpha, harder falloff) plus a
 * CRISP contact line under the feet — contact, not blur.
 */
export function groundShadowV2(
  ctx: CanvasRenderingContext2D,
  cx: number, groundY: number, scale: number,
  skewX = 0,
  rot = 0
): void {
  ctx.save();
  ctx.translate(cx, groundY);
  ctx.scale(scale, scale);
  // AUDIT-2 / §10.2: `rot` rotates the whole shadow rig to a scene's
  // ground slope (the ownerWorker owner stands ON a rising line — his
  // shadow now lies on the same plane as his footing instead of a third
  // phantom plane).
  if (rot !== 0) ctx.rotate(rot);
  // the ambient ring — the soft outer claim on the floor (kept, smaller)
  const g = ctx.createRadialGradient(-4 + skewX, 4, 6, -4 + skewX, 4, 88);
  g.addColorStop(0, rgba(PALETTE.shadow, 0.45));
  g.addColorStop(0.5, rgba(PALETTE.shadow, 0.15));
  g.addColorStop(1, rgba(PALETTE.shadow, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-4 + skewX, 7, 86, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  // the CRISP contact line — the tight dark line the K's shadow already
  // has, right under the feet (±40px): the anchor that kills the float.
  // Panel round 2: the judge read the first pass as "a line running through
  // the shadow" — the contact line now sits clearly below the ellipse's
  // core, darker (0.58) and thicker (4.2), hugging the soles.
  ctx.strokeStyle = rgba(PALETTE.shadow, 0.58);
  ctx.lineWidth = 4.2;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-40, 10); ctx.lineTo(40, 10); ctx.stroke();
  // the soft stage line — kept at low alpha
  ctx.strokeStyle = rgba(PALETTE.shadow, 0.30);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-130, 8); ctx.lineTo(130, 8); ctx.stroke();
  ctx.strokeStyle = rgba(PALETTE.gold, 0.85);
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-34, 8); ctx.lineTo(34, 8); ctx.stroke();
  ctx.restore();
}

/**
 * drawStickmanV2 — drop-in visual upgrade of drawStickman() (same call sites).
 * Skeletal math is unchanged (poses still come from Stickman.poseAt), so all
 * existing scenes, walk cycles and gesture blends keep working.
 * v3: `talk` (0..1 mouth openness envelope, panel P0-4) — pass
 * `g.speaking ? talkAt(g.beatT, g.wordTimes) : 0` at host call sites.
 */
export function drawStickmanV2(
  ctx: CanvasRenderingContext2D,
  cx0: number,
  groundY0: number,
  scale: number,
  t: number,
  r: {
    pose: import('./stickman').Pose;
    alpha?: number;
    flip?: boolean;
    look?: number;
    shadow?: number;
    scarf?: boolean;
    nod?: number;
    /** 0..1 mouth openness envelope, driven by word timings (v3, P0-4). */
    talk?: number;
    /** 100-JUDGE AUDIT (Part 8.2): the word texts for the active beat, used
     *  to derive the Preston Blair viseme from the active word's first
     *  letter. When omitted, the viseme defaults to 'X' (the original
     *  4-shape envelope runs). */
    wordTexts?: string[];
    /** 100-JUDGE AUDIT (Part 8.2): the word onset times in beat-local ms,
     *  paired with wordTexts. Same array the talk envelope already uses. */
    wordTimes?: number[];
    /** 100-JUDGE AUDIT (Part 8.2): beat-local time t, for the viseme
     *  lookup (the wordTimes are beat-local, so the lookup must use the
     *  same clock). */
    beatT?: number;
    /** P1-1 (report): head/face scale multiplier in CLOSE staging — the
     *  editorial host and other large compositions draw the face ~40% bigger
     *  so expressions read at distance. 1 = body-proportional (default). */
    faceScale?: number;
    /** Hand prop (v5, audit P1-3): 'coffee' — the second character's mug;
     * 'thumb' — a thumb stub on the raised fist for the thumbsUp pose. */
    prop?: 'coffee' | 'thumb';
    /** v10.1 (panel 11 re-review): register the FULL-BODY envelope as a
     * 'host' rect for the guard's host-vs-content check. Side hosts /
     * walk hosts set this; diagram characters (ownerWorker figures, the
     * coffee guy) do NOT — they stand ON their data by design. */
    hostBody?: boolean;
    /** PANEL-12 / P1-1+P1-4: the walk stride phase (0..1 per stride pair)
     * while this figure is walking. Drives (a) scarf wave amplitude ×1.8
     * (velocity coupling — cloth moves when the body moves) and (b) the
     * contact-dust motes at each foot-plant (P2-5). Pure function of t at
     * the call site (walkIn returns it) — scrub-safe. */
    walkPhase?: number;
    /** PANEL-12 / P2-1 (report §14.1): foreground parallax. When true the
     * figure rides a second transform moving at 1.25× the camera's dx/dy —
     * the presenter slides against his stage on every push/truck, which is
     * the single cheapest depth cue available to a 2D stage. The offset is
     * applied to (cx, groundY) BEFORE drawing so the collision-guard
     * registration moves with the pixels — the guard stays exact.
     * P2-4 (audit Table 4): `parallaxAmt` raises the differential on hero
     * moments (0.55 on the reaction close-ups and the cold-open shock;
     * default 0.40 — the certified register). */
    parallax?: boolean;
    parallaxAmt?: number;
    /** PANEL-12 / P3-2: perspective-floor scenes pass the vanishing-point
     * skew for the soft ground-shadow ellipse (aiDatacenter). */
    shadowSkew?: number;
    /** AUDIT-2 / §10.2 (report §5.2): rotate the ground shadow rig to the
     * scene's ground slope (ownerWorker's owner stands on a rising line). */
    shadowRot?: number;
    /** AUDIT-2 / §10.3 (report §4.2): word-onset accent pulse 0..1 — above
     *  0.25 the near arm draws a 0.35-alpha motion-blur ghost (the
     *  generalized text smear, on the fastest limb in the frame). */
    smear?: number;
    /** AUDIT-3 / §2.4 (report Phase 2.4): 0..1 landing/slam body squash
     *  about the feet (see the transform note at the top of the body).
     *  Drive with a short decaying pulse at the impact time. */
    squash?: number;
    /** AUDIT-3 / §3.1 (report Phase 3.1 — differentiate character two):
     *  'prof' draws the round-glasses + wide-torso variant (a different
     *  PERSON, not the host at another scale). The signature-scene coffee
     *  character uses it; default = the host template. */
    variant?: 'prof';
    /** BLUEPRINT Phase 2 (report §11): the reaction-beat jaw multiplier —
     *  the shock/wry/warm poses drive a 2x jaw opening on the twist so the
     *  gasp reads at 320px. Drive from the reaction envelope at the call
     *  site (1 + 1*rP on the twist beat). */
    jaw2x?: number;
    /** P1-1 (100-judge audit, Table 3 — HEAD REDESIGN): 'classic' = the
     *  shipped cream head + 14px outline (the "ninja-hood" read);
     *  'thin' = the same head, outline 14 → 9.5px (a drawn line, not a
     *  hood); 'becker' = solid ink head, white dot eyes, zero interior
     *  clutter — silhouette-first, readable at 20px. A/B'd at 320px on
     *  the shock close-up; the panel's winner ships as the default. */
    headStyle?: 'classic' | 'thin' | 'becker';
    /** AUDIT-ROUND-2 (fix 19 — Z-ORDER + CONTACT, the split draw): when
     *  'far', ONLY the ground shadow + far limbs draw (behind an object
     *  the caller will interpose); when 'rest', everything from the near
     *  leg onward draws (in front of it). Default/'all' draws the whole
     *  figure in one pass. The signature scene uses this so the draw
     *  order becomes far-arm → K → near-arm — the z-order impossibility
     *  ("the host's arm passes in front of the K's upper diagonal but
     *  his body is behind the stem") dies. Pure rendering split: the
     *  pose math is untouched, so both passes evaluate identically. */
    phase?: 'far' | 'rest' | 'all';
    /** AUDIT-ROUND-2 (fix 19): draw a small soft contact shadow where the
     *  near fist meets a presented object (the K's stem on leanOnK) —
     *  "the presenter finally touches what he presents" now has its
     *  shadow: the fist lands ON the gold instead of floating over it.
     *  Rendered in the 'rest' pass, just under the near hand glyph. */
    kContact?: boolean;
  },
  seed = 0
): void {
  const pose0 = r.pose;
  const alpha = r.alpha ?? 1;
  if (alpha <= 0.001) return;
  // AUDIT-2 / 1.1: arm the boil clock for this draw — every limb2() call
  // from here down jitters on the quantized 3-phase clock (pure function of
  // t, so scrub-determinism survives).
  // P2-6: mid-gesture-spring (smear > 0.45) drops the boil to on-twos at
  // half amplitude — the smear trail carries the motion, the jitter must
  // not strobe against it at the 30fps phone gate.
  boilReset(t, (r.smear ?? 0) > 0.45);
  // AUDIT-3 / §2.4 (report Phase 2.4 — SQUASH ON LANDINGS): 0..1 body
  // squash about the ground contact (feet stay planted, everything above
  // compresses 6% and widens 5% — volume-preserving). Driven by a short
  // decaying pulse at slam/landing times. Applied inside the figure
  // transform stack below, after translate(cx, groundY). Pure function of
  // caller data.
  const squash = r.squash ?? 0;
  // BLUEPRINT Phase 2: the jaw multiplier reaches the mouth (the shock
  // reaction's 2x gasp).
  const jaw2x = r.jaw2x ?? 1;
  // P2-4 (audit Table 4 — DEPTH WITH INTENT): "raise parallax to 0.55 on
  // 2-3 hero moments". The default differential stays 0.40 (the
  // certified phone-gate register); hero moments (the reaction close-ups,
  // the cold-open shock) pass 0.55 — the figure visibly separates from
  // its stage exactly when the frame is about the figure.
  let cx = cx0;
  let groundY = groundY0;
  if (r.parallax) {
    const pAmt = r.parallaxAmt ?? 0.4;
    cx += camState.dx * pAmt;
    groundY += camState.dy * pAmt;
  }
  // v9 (report P0-1 / D-02): register the figure's feet + ground-shadow
  // envelope so the collision guard can assert the caption pill never
  // plates a host's footing again. Shadow: rx 118, ry 26 centered at
  // groundY+8 (groundShadowV2), feet within ±40px of cx at groundY.
  registerRect(
    `stickman@${Math.round(cx)},${Math.round(groundY)}`,
    cx - 122 * scale, groundY - 12 * scale, 244 * scale, 48 * scale
  );
  // v10.1 (panel 11 re-review): the feet-only envelope let the statCards
  // host plate a stat card's number+tag unseen — the body above the feet
  // was never registered. Full-body envelope (head to shadow) as cls 'host'
  // for opted-in callers; the guard checks it against every content rect.
  if (r.hostBody) {
    registerRect(
      `hostBody@${Math.round(cx)},${Math.round(groundY)}`,
      cx - 128 * scale, groundY - 296 * scale, 256 * scale, 332 * scale,
      'host'
    );
  }
  // AUDIT-ROUND-2 (fix 19 — the split draw): 'far' renders shadow + far
  // limbs only; 'rest' renders from the near leg onward; 'all' (default)
  // renders everything — the single-pass drop-in every existing call site
  // keeps using. Both phases run the identical pose math.
  const phase = r.phase ?? 'all';
  const drawFar = phase === 'far' || phase === 'all';
  const drawRest = phase === 'rest' || phase === 'all';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, groundY);
  // AUDIT-3 / §2.4: the squash rides the figure transform ABOUT the
  // ground-contact origin (translate happens before scale, so the feet
  // stay planted while the body compresses).
  // PREMIUM UPGRADE M1: WALK WEIGHT. The contact squash rises from 6% to 18%
  // (volume-preserving: width +18%, height -22%). The figure visibly compresses
  // at each foot plant — the walk gains weight. The old 6% was below perception
  // at the phone gate; 18% reads as a heavy landing.
  if (squash > 0.001) ctx.scale(1 + 0.18 * squash, 1 - 0.22 * squash);
  ctx.scale(r.flip ? -scale : scale, scale);
  // v6 idle life: a 2.4s breath sway (±0.23°) around the ground contact —
  // the freeze between sentences read as a mannequin without it.
  ctx.rotate(Math.sin(t / 2400 + seed * 1.7) * 0.004);
  // v10 (panel CHAR-2): WEIGHT SHIFT — a slow 4.6s hip settle.
  // AUDIT-3 / §2.2 (report Phase 2.2 — CONTRAPPOSTO IDLE): the terms were
  // sub-pixel at phone scale (±1.8px at scale 1.0), which is why the
  // BEFORE renders still read “mannequin between sentences”. 
  // BLUEPRINT Phase 1 (report Table 7): the idle register rises to the
  // panel's numbers — weight ±7.5px (AMP.weightShift) driving a ±4.0°
  // shoulder counter (AMP.shoulderCounterDeg). Hips and shoulders oppose
  // each other on a line a phone viewer can finally SEE.
  const weight = Math.sin(t / 4600 + seed * 2.3) * AMP.weightShift;
  const counter = Math.sin(t / 4600 + seed * 2.3);
  ctx.translate(weight, 0);
  ctx.rotate(Math.sin(t / 6200 + seed * 0.9) * 0.003);
  // the pose-level contrapposto offsets (applied on a COPY — callers'
  // pose objects are never mutated)
  const pose: import('./stickman').Pose = {
    ...pose0,
    lAU: pose0.lAU - counter * AMP.shoulderCounterDeg,
    rAU: pose0.rAU + counter * AMP.shoulderCounterDeg,
  };
  // BLUEPRINT Phase 2: the two rotation terms the rig never had —
  // PELVIS TILT (the hip line tilts; the torso grows from the tilted
  // pelvis) and SHOULDER TILT (the shoulder anchors counter it). Walked
  // figures carry them from walkPose; idle poses default to 0.
  const hipT = (pose.pelvisTilt ?? 0) * D2R;
  const shT = (pose.shoulderTilt ?? 0) * D2R;
  // PANEL-12 / P0-5 (report §12.5): PROPORTIONS — shorter legs, bigger
  // head, stockier torso. TORSO 96→88, U_LEG 72→64, L_LEG 66→58: the v2
  // figure was 7.2 heads tall on pin legs — the panel read "coat hanger".
  // The new stack is ~6.4 heads and reads "person". Head stroke 8→9 so
  // the face keeps its ink weight at the shorter scale.
  const U_LEG = 64, L_LEG = 58, TORSO = 88, U_ARM = 58, L_ARM = 54;
  const pelvisY = -U_LEG - L_LEG + pose.rootY;
  // BLUEPRINT Phase 2: the hip anchors ride the pelvis tilt — right hip
  // rises when pelvisTilt is positive (weight onto the left leg), left
  // hip drops; the torso grows from the tilted hip line (its lean picks
  // up half the tilt) so the upper body answers the hips.
  const hipRise = Math.sin(hipT) * 6.5;
  const hipLX = -6 * Math.cos(hipT), hipRX = 6 * Math.cos(hipT);
  const hipLY = pelvisY + hipRise, hipRY = pelvisY - hipRise;
  const leanR2 = pose.lean * D2R + hipT * 0.5;
  const leanR = leanR2;
  const neckX = Math.sin(leanR2) * TORSO;
  const neckY = (hipLY + hipRY) / 2 - Math.cos(leanR2) * TORSO;

  // ground (v2 layered shadow; P3-2 skew + P3-3 one-light offset inside)
  // AUDIT-ROUND-2 (fix 19): the shadow belongs to the FAR pass — it grounds
  // the figure behind anything the caller interposes between the phases.
  if ((r.shadow ?? 1) > 0 && drawFar) groundShadowV2(ctx, 0, 0, 1, r.shadowSkew ?? 0, r.shadowRot ?? 0);

  const ink = PALETTE.ink;
  // PREMIUM UPGRADE 3D-1: VALUE-BASED DEPTH ON FAR LIMBS. The "one ink
  // value" rule is reversed — Alan Becker's stickman uses a 12% value shift
  // on far limbs for atmospheric perspective. The far limb recedes into
  // the atmosphere; the near limb comes forward. Combined with the existing
  // overlap depth cue, the figure gains 2.5D volume from one colour change.
  const farInk = hexLerp(ink, PALETTE.bgSoft, 0.14);
  // AUDIT-3 / Walk 3.0 (§2.6): the shoe PITCHES with the stride (lToe/rToe
  // from walkPose) — heel-strike (toe up) through toe-off (toe down).
  // BLUEPRINT Phase 2 (report §11): the 18x8.5 ELLIPSE becomes a DRAWN
  // WEDGE with a heel counter, instep and toe box. Rotates about the
  // ankle; the sole rides the ground line.
  // AUDIT-ROUND-2 (fix 12 — WALK EXTREMES): the lever lengthens 29 → 36px
  // (AMP.shoeLeverPx) — the ±40° toe roll finally has a lever arm you can
  // SEE at any host scale (the old 29px read as a paddle at 320px).
  const shoeWedge = (f: { ex: number; ey: number }, col: string, rotDeg = 0): void => {
    ctx.save();
    ctx.translate(f.ex, f.ey - 4);
    ctx.rotate(rotDeg * D2R);
    ctx.fillStyle = col;
    ctx.beginPath();
    // heel counter — rounded back of the shoe
    ctx.moveTo(-9.3, -4);
    ctx.quadraticCurveTo(-13, 1, -9.9, 7);
    // sole — flat contact line with a hint of toe-spring at the front
    ctx.lineTo(16.1, 8.2);
    ctx.quadraticCurveTo(25.4, 8.4, 27.3, 5.4);
    // toe box — the rounded front cap that reads as a SHOE
    ctx.quadraticCurveTo(29, 2.2, 25.4, 0.4);
    // instep — dips up to the ankle
    ctx.quadraticCurveTo(16.1, -1.4, 5, -3.6);
    ctx.quadraticCurveTo(-3.7, -5.4, -9.3, -4);
    ctx.closePath();
    ctx.fill();
    // the sole line — a slightly darker pass under the wedge so the
    // ground contact reads (one light, shadow tone)
    ctx.strokeStyle = rgba(PALETTE.shadow, 0.55);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-9.3, 7.6);
    ctx.quadraticCurveTo(7.4, 8.6, 23.6, 6.6);
    ctx.stroke();
    ctx.restore();
  };
  let farFoot: { ex: number; ey: number } | null = null;
  if (drawFar) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // BLUEPRINT Phase 2 (report §11, INK register): the phone feed rewards
    // DARK MASS on pale ground — limb weights rise so the figure carries
    // the frame's identity at 320px (far leg 12/10/9 -> 17/13/10, far arm
    // 9/8/7 -> 13/10/8).
    farFoot = limb2(ctx, hipLX, hipLY, pose.lLU, pose.lLL, U_LEG, L_LEG, INK.legFar[0], INK.legFar[1], INK.legFar[2], farInk, pose.lLift ?? 0);
    // 100-JUDGE AUDIT (Part 9.3 — COUNTER-ARM SECONDARY MOTION). When the
    // near arm gestures (smear > 0), the far arm should counter-balance —
    // a small opposite-direction movement that maintains body balance.
    // Premium character animation never freezes the off-arm; it answers
    // the gesture. The counter is 40% of the near arm's accent, opposing
    // direction — body balance reads as "a real gesture", not "a pose".
    const counterSmear = (r.smear ?? 0) * 0.40;
    const farAU = pose.lAU + counterSmear * 8;   // small upward counter
    const farAL = pose.lAL - counterSmear * 12;  // small outward counter
    const farHand = limb2(ctx, neckX - 4 + Math.sin(shT) * -4, neckY + 3 + Math.sin(shT) * 9 - (pose.shoulderDrop ?? 0) * 0.6, farAU, farAL, U_ARM, L_ARM, INK.armFar[0], INK.armFar[1], INK.armFar[2], farInk);
    handGlyph(ctx, farHand.ex, farHand.ey, farAL, 12, farInk, scale, pose.lHand); // P1-2 r3
    // AUDIT-2 / 0.1: the far shoe steps with its limb (farInk) — depth,
    // not a second colour system.
    shoeWedge(farFoot, farInk, pose.lToe ?? 0);
    ctx.restore();
  }
  if (!drawRest) { ctx.restore(); ctx.restore(); return; }

  // NEAR leg (support) — P0-3: both feet now get a shoe, slightly
  // oversized and forward-set.
  // BLUEPRINT Phase 2 (INK): near leg 15/12/10 -> 21/16/12 — the support
  // leg is the figure's anchor mass.
  const nearFoot = limb2(ctx, hipRX, hipRY, pose.rLU, pose.rLL, U_LEG, L_LEG, INK.legNear[0], INK.legNear[1], INK.legNear[2], ink, pose.rLift ?? 0);
  shoeWedge(nearFoot, ink, pose.rToe ?? 0);

  // PANEL-12 / P2-5 (report §14.5) — CONTACT DUST on foot-plant. Three
  // motes per plant, 200ms life, shadow-color at 0.25 alpha, keyed to the
  // walk phase (pure function of t — the ground participates in the walk).
  if (r.walkPhase !== undefined) {
    for (const c of [0, 0.5]) {
      const age = (((r.walkPhase - c) % 1) + 1) % 1;
      if (age >= 0.12) continue;
      const p = age / 0.12;
      const foot = c === 0 ? nearFoot : farFoot;
      if (!foot) continue;
      for (let k = 0; k < 3; k++) {
        const h = hash01(k * 7.3 + Math.floor(r.walkPhase * 2) * 13.1 + c * 100 + seed);
        const dir = k === 0 ? -1 : k === 1 ? 1 : 0.3;
        ctx.fillStyle = rgba(PALETTE.shadow, 0.25 * (1 - p));
        ctx.beginPath();
        ctx.arc(
          foot.ex + dir * (5 + 16 * p) * (0.5 + h * 0.5),
          foot.ey - 4 - 10 * p * h,
          4 * (1 - p * 0.45),
          0, Math.PI * 2
        );
        ctx.fill();
      }
    }
  }

  // PREMIUM UPGRADE C2: TORSO AS SHAPED CAPSULE. The single taper (a spine
  // line that widens) is replaced with a filled path: chest bulge, waist
  // narrowing, hip block, shoulder caps. The figure gains silhouette mass
  // the camera can frame and the light can hit. A taper reads as a line;
  // a capsule reads as a body.
  const prof = r.variant === 'prof';
  {
    const tx0 = 0, ty0 = pelvisY + 4, tx1 = neckX, ty1 = neckY;
    const tdx = tx1 - tx0, tdy = ty1 - ty0;
    const tL = Math.hypot(tdx, tdy) || 1;
    const tnx = -tdy / tL, tny = tdx / tL;
    // half-widths at 4 key points: hips(0), waist(0.45), chest(0.75), shoulders(1.0)
    // PREMIUM UPGRADE M4: CHEST BREATHING. The chest widens ±4% on a 2.4s
    // breath cycle — the torso expands on inhale, narrows on exhale. Reads
    // as breathing, not as a vertical bob. The shoulders also rise 2px on
    // inhale (shoulderY offset below).
    const chestBreathe = 1 + Math.sin(t / 2400 + seed * 3.1) * 0.04;
    const wH = prof ? 17.5 : 15, wW = prof ? 13 : 11;
    const wC = (prof ? 20 : 17) * chestBreathe, wS = (prof ? 17.5 : 15) * chestBreathe;
    const rX = (h: number, w: number) => tdx * h + tnx * w;
    const rY = (h: number, w: number) => ty0 + tdy * h + tny * w;
    const lX = (h: number, w: number) => tdx * h - tnx * w;
    const lY = (h: number, w: number) => ty0 + tdy * h - tny * w;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(rX(0, wH), rY(0, wH));
    ctx.quadraticCurveTo(rX(0.25, wH * 0.7), rY(0.25, wH * 0.7), rX(0.45, wW), rY(0.45, wW));
    ctx.quadraticCurveTo(rX(0.6, wW * 1.1), rY(0.6, wW * 1.1), rX(0.75, wC), rY(0.75, wC));
    ctx.quadraticCurveTo(rX(0.9, wC * 0.95), rY(0.9, wC * 0.95), rX(1.0, wS), rY(1.0, wS));
    ctx.lineTo(lX(1.0, wS), lY(1.0, wS));
    ctx.quadraticCurveTo(lX(0.9, wC * 0.95), lY(0.9, wC * 0.95), lX(0.75, wC), lY(0.75, wC));
    ctx.quadraticCurveTo(lX(0.6, wW * 1.1), lY(0.6, wW * 1.1), lX(0.45, wW), lY(0.45, wW));
    ctx.quadraticCurveTo(lX(0.25, wH * 0.7), lY(0.25, wH * 0.7), lX(0, wH), lY(0, wH));
    ctx.closePath();
    ctx.fill();
    // shoulder caps — small rounded delts at the shoulder line
    ctx.beginPath();
    ctx.arc(rX(0.92, wS * 0.6), rY(0.92, wS * 0.6), wS * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lX(0.92, wS * 0.6), lY(0.92, wS * 0.6), wS * 0.45, 0, Math.PI * 2);
    ctx.fill();
    // hip block — a short horizontal bar at the pelvis for grounding
    ctx.beginPath();
    ctx.ellipse(tx0 + tdx * 0.08, ty0 + tdy * 0.08, wH * 1.1, wH * 0.45, Math.atan2(tdx, -tdy), 0, Math.PI * 2);
    ctx.fill();
  }
  // (fix 21's torso rim draws ONCE, after the near arm — see the pass by
  // the hand below; the under-arm pass was retired: its end anchored at the
  // neck centreline and the line drifted inside the torso, which the panel
  // read as "a pale strip floating inside". The surviving pass rides the
  // torso's outer right flank, shoulder to mid-torso, unoccluded.)
  // AUDIT-PHASE-2: SIGNATURE TORSO BAND — a gold band across the chest.
  // The host becomes identifiable by silhouette color in any thumbnail
  // or feed scroll (the Alan-Becker chosen-one-color rule). Brand-
  // reinforcing; rides the lean angle so it stays anatomically on the
  // chest through poses. Draws at 75% alpha so it never fights the
  // scarf's brand primacy.
  if (r.scarf !== false) {
    const bandY = pelvisY - TORSO * 0.55;
    const bandW = (prof ? 24 : INK.torso[0]) * 0.9 + 8;
    ctx.save();
    ctx.translate(neckX * 0.5, bandY);
    ctx.rotate(leanR2);
    ctx.fillStyle = rgba(PALETTE.gold, 0.75);
    ctx.beginPath();
    ctx.moveTo(-bandW, -6);
    ctx.lineTo(bandW, -6);
    ctx.lineTo(bandW * 0.85, 6);
    ctx.lineTo(-bandW * 0.85, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(PALETTE.goldDeep, 0.5);
    ctx.fillRect(-bandW * 0.85, 4, bandW * 1.7, 2);
    ctx.restore();
  }

  // AUDIT-2 / 1.4 (report §10.2, C6) — THE COLLAR BREAK. The gold knot
  // flowed into the head circle with no separation ("the head looks
  // welded to clothing"). Two short tapered ink strokes flare from the
  // neck, and the knot drops 3px so background shows between chin,
  // collar and scarf: three tailored layers instead of one stack.
  if (r.scarf !== false) {
    taper(ctx, neckX - 4, neckY + 1, neckX - 13, neckY + 13, 7, 3.5, ink);
    taper(ctx, neckX + 4, neckY + 1, neckX + 13, neckY + 13, 7, 3.5, ink);
  }

  // gold scarf (brand) — P0-4: knot + the filled two-tone ribbon tail.
  // P1-4/P1-5 (report §12.5): wave amplitude couples to body motion — and
  // the walk coupling rises 1.8 → 3.2: at 1.8 the scarf only kept pace with
  // the stride; at 3.2 it ANSWERS it (the fabric trails each plant and
  // whips on the push-off — a secondary action that says "there is mass
  // and air here", the classic follow-through tell).
  if (r.scarf !== false) {
    // P1-3 (audit Table 3 — the CREST WAVE): the tail's crest now answers
    // the VOICE — amplitude couples to the talk envelope (speech is air
    // moving) plus a fast secondary term, so word accents whip the crest
    // the way strides whip the whole tail.
    const talkEnv = r.talk ?? 0;
    const wave =
      Math.sin(t / 700 + seed) * 6 * (r.walkPhase !== undefined ? 3.2 : 1) * (1 + talkEnv * 1.4) +
      Math.sin(t / 240 + seed * 2) * 3.2 * talkEnv;
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.ellipse(neckX, neckY + 10, 13, 8, leanR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // v10 (panel CHAR-3): a goldDeep outline on the knot — at side-host
    // scale the solid knot read as "a stain"; the two-tone knot reads as
    // a tied scarf at any size.
    ctx.strokeStyle = PALETTE.goldDeep;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(neckX, neckY + 10, 13, 8, leanR * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    // the ribbon — width, S-curve, two-tone underside (was 2 stroked lines)
    // AUDIT-3 / §1.3 (report Phase 1.3 — the mitten lesson applied to
    // cloth): below rig scale 1.2 the ribbon collapses into a smear at
    // phone-feed scale (Finding C-8: “the gold scarf becomes a smear”).
    // Below 1.2 the scarf is the KNOT ONLY — a clean brand mark, never mush.
    if (scale >= 1.2) {
      scarfTail(ctx, neckX - 3, neckY + 14, wave, PALETTE.gold, '#A8851B'); // P1-3 r2: +3 — chin clearance under the solid head
    }
  }

  // NEAR arm — capture the hand so props ride it (v5, audit P1-3)
  // P1-4 (audit Table 3): the SHOULDER DROP — the near shoulder sinks by
  // pose.shoulderDrop (the wry slouch +4.5px, the warm chest-open lift
  // −3px). A silhouette-level emotion term: the shoulder LINE tilts, the
  // whole read changes shape, not just a brow angle.
  const shDrop = pose.shoulderDrop ?? 0;
  // 100-JUDGE AUDIT (Part 9.1 — REAL SMEAR FRAMES). The old 2-ghost trail
  // read as "three arms" / "rubbery" on stills and vanished at the phone
  // gate. A real smear frame is ONE elongated tapered polygon stretched
  // along the limb's motion vector, plus 3-4 ghost finger-stubs trailing
  // the hand. It exists for 1-2 frames at peak velocity and is invisible
  // at rest. The motion vector is approximated by the difference between
  // the current pose and the previous-frame pose (the caller's smear
  // value already encodes this — it fires in the 60-160ms strike window).
  if ((r.smear ?? 0) > 0.12) {
    const sm = clamp01(r.smear ?? 0);
    // the elongated smear body — ONE tapered polygon stretched 1.5x along
    // the gesture arc, low-alpha, drawn UNDER the solid arm
    const sx = neckX + 4 + Math.sin(shT) * 4;
    const sy = neckY + 3 - Math.sin(shT) * 9 + shDrop;
    const aU = pose.rAU * Math.PI / 180;
    const aL = pose.rAL * Math.PI / 180;
    // the hand position (current)
    const ex = sx + Math.sin(aU) * U_ARM + Math.sin(aL) * L_ARM;
    const ey = sy + Math.cos(aU) * U_ARM + Math.cos(aL) * L_ARM;
    // the trailing position (where the hand was a beat ago): offset opposite
    // to the gesture direction by ~18% of the arm length × smear strength
    const trailDX = -Math.sin(aL) * L_ARM * 0.35 * sm;
    const trailDY = -Math.cos(aL) * L_ARM * 0.35 * sm;
    ctx.save();
    ctx.globalAlpha = alpha * 0.42 * sm;
    ctx.fillStyle = ink;
    // the smear body — a long tapered polygon from the trail position to
    // the current hand, wider at the shoulder, narrow at the hand
    const dx = ex - (ex + trailDX), dy = ey - (ey + trailDY);
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const wShoulder = INK.armNear[0] * 0.9;
    const wHand = INK.armNear[2] * 0.6;
    ctx.beginPath();
    ctx.moveTo(sx + nx * wShoulder / 2, sy + ny * wShoulder / 2);
    ctx.lineTo(ex + nx * wHand / 2, ey + ny * wHand / 2);
    ctx.lineTo(ex - nx * wHand / 2, ey - ny * wHand / 2);
    ctx.lineTo(sx - nx * wShoulder / 2, sy - ny * wShoulder / 2);
    ctx.closePath();
    ctx.fill();
    // 3 ghost finger-stubs trailing the hand — short tapered lines fanned
    // along the motion vector, each at decreasing alpha
    for (let f = 0; f < 3; f++) {
      const fa = (1 - f / 3) * sm * 0.55;
      const fLen = 14 - f * 3;
      const fAng = aL + (f - 1) * 0.18;
      ctx.globalAlpha = alpha * fa;
      taper(ctx, ex, ey,
        ex + Math.sin(fAng) * fLen + trailDX * 0.4,
        ey + Math.cos(fAng) * fLen + trailDY * 0.4,
        5, 2, ink);
    }
    ctx.restore();
  }
  // BLUEPRINT Phase 2: near arm 13/11/9 -> 17/13/10 (INK.armNear); the
  // shoulder anchor rides the shoulder-line counter-tilt (Phase 2's
  // second rotation term — the near shoulder rises when shT is positive)
  // and the P1-4 shoulder drop.
  const hand = limb2(ctx, neckX + 4 + Math.sin(shT) * 4, neckY + 3 - Math.sin(shT) * 9 + shDrop, pose.rAU, pose.rAL, U_ARM, L_ARM, INK.armNear[0], INK.armNear[1], INK.armNear[2], ink);
  // Panel round 2 (fix 21): the torso rim drawn under the near arm was
  // OCCLUDED by it ("a stub near the shoulder, a sliver at mid-torso").
  // The rim re-draws here — AFTER the arm — as an upper-right edge on the
  // visible torso flank: one continuous ivory light line.
  {
    const wS2 = prof ? 24 : INK.torso[0];
    const wN2 = prof ? 35 : INK.torso[1];
    const dx2 = neckX, dy2 = neckY - (pelvisY + 4);
    const L2 = Math.hypot(dx2, dy2) || 1;
    const nx2 = -dy2 / L2, ny2 = dx2 / L2;
    const rx2 = nx2 > 0 ? nx2 : -nx2, ry2 = nx2 > 0 ? ny2 : -ny2;
    // Round 3 correction: the rim's END rides the torso's outer edge at the
    // SHOULDER (neck + normal·half shoulder width) — the old end anchored at
    // the neck centreline and the rim drifted inside the torso ("a pale
    // strip floating inside"). Start: the flank at 25% up; end: the flank at
    // the shoulder. The line stays ON the silhouette's edge, never inside.
    const wAt = (h: number): number => lerp2(wS2, wN2, h);
    const pAt = (h: number): [number, number] => [dx2 * h, (pelvisY + 4) + dy2 * h];
    const [sx2, sy2] = pAt(0.25);
    const [ex2, ey2] = pAt(1.0);
    taper(ctx,
      sx2 + rx2 * (wAt(0.25) * 0.5) * 1.02, sy2 + ry2 * (wAt(0.25) * 0.5) * 1.02,
      ex2 + rx2 * (wN2 * 0.5) * 1.02, ey2 + ry2 * (wN2 * 0.5) * 1.02,
      4.8, 2.6, '#F7EFD8');
  }
  // AUDIT-ROUND-2 (fix 19 — CONTACT): the small soft shadow where the near
  // fist meets the presented object (the K's stem on leanOnK). Drawn just
  // UNDER the hand glyph so the fist lands ON it — the touch the audit
  // demanded: "a small contact shadow where the hand meets the stem".
  if (r.kContact) {
    ctx.fillStyle = rgba(PALETTE.shadow, 0.38);
    ctx.beginPath();
    ctx.ellipse(hand.ex + 2, hand.ey + 7, 26, 11, pose.rAL * D2R * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // P0-2 + AUDIT-2 / 1.3 (report §10.2, C5): TWO GLYPHS — the fan at hero
  // scale, the mitten below rig scale 0.85 (BLUEPRINT: threshold 1.0 ->
  // 0.85 so the glyph never switches mid-scene on a scaled host),
  // selected right here.
  handGlyph(ctx, hand.ex, hand.ey, pose.rAL, 16, ink, scale, pose.rHand); // P1-2 r3: rig scale picks the glyph tier
  if (r.prop === 'thumb') {
    // a short stub above the fist — reads as a raised thumb at any scale
    ctx.strokeStyle = ink;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hand.ex, hand.ey - 4);
    ctx.lineTo(hand.ex + 3, hand.ey - 24);
    ctx.stroke();
  }
  if (r.prop === 'coffee') {
    // the second character's mug — upright regardless of arm angle
    ctx.save();
    ctx.translate(hand.ex, hand.ey + 6);
    // cup body
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    roundRect(ctx, -14, -12, 28, 32, 6);
    ctx.fill();
    ctx.stroke();
    // handle on the outer (screen-right) side
    ctx.beginPath();
    ctx.arc(17, 4, 9, -Math.PI / 2.2, Math.PI / 2.2);
    ctx.stroke();
    // coffee surface
    ctx.fillStyle = rgba('#8F6E12', 0.9);
    roundRect(ctx, -10, -9, 20, 6, 3);
    ctx.fill();
    // steam — two deterministic wisps
    ctx.strokeStyle = rgba(PALETTE.shadow, 0.55);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let s = 0; s < 2; s++) {
      const ph = t / 640 + s * 2.4;
      ctx.beginPath();
      ctx.moveTo(-4 + s * 9, -14);
      ctx.quadraticCurveTo(
        -4 + s * 9 + Math.sin(ph) * 7, -26,
        -4 + s * 9 + Math.sin(ph + 1.2) * 9, -38
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // head — tilt + eye glints + subtle cheek warmth
  const tiltR = (pose.lean + pose.headTilt) * D2R;
  // AUDIT-ROUND-2 (fix 11 — HEAD YAW AT CONTENT): the whole head pivots
  // about the NECK joint by pose.headYaw (±14°, set by the same pointBias
  // the arms use in Stickman.poseAt). The head displaces toward the
  // content (~10px at host scale) and its features rotate with it — a
  // genuine 2D head turn. The pupils' 7px look travel rides ON TOP
  // (eyeDX below), exactly as the audit specified: "the audience reads
  // connection through the head yaw first, eyes second".
  const yawR = (pose.headYaw ?? 0) * D2R;
  const headCX = neckX + Math.sin(tiltR) * (10 + 33 * 0.9);
  const headCY = neckY - Math.cos(tiltR) * (10 + 33 * 0.9);
  // AUDIT-ROUND-2 (fix 14): nod pulse 4 → 7px — the word-accent nod
  // survives the 320px gate.
  const nod = (r.nod ?? 0) * 7;
  // P1-1 (report): face scale for close staging — applied around the head
  // centre so the neck attachment point stays put; only the face grows.
  const faceS = r.faceScale ?? 1;
  // P1-1 (100-judge audit, Table 3 — HEAD REDESIGN): the shipped head
  // (cream fill + 14px ink outline) read as "a dark ring around a tan
  // disc — big-head/ninja-hood stick figure": the outline is heavy
  // enough to read as a HOOD, and at 320px the interior features
  // dissolve leaving exactly the ninja silhouette. Three styles:
  //   'classic' — shipped (the A/B control);
  //   'thin'    — same head, outline 14 → 9.5px: a drawn line, not a hood;
  //   'becker'  — solid ink head, white dot eyes + white mouth, zero
  //               interior clutter — silhouette-first, readable at 20px.
  // A/B VERDICT (panel, 320px shock close-up): becker > thin > classic —
  // "silhouette-first wins: every saved interior pixel becomes emotional
  // signal". BECKER ships as the film's head. See AB_P1-1_*.png frames.
  const headStyle = r.headStyle ?? 'becker';
  const becker = headStyle === 'becker';
  const headStroke = becker ? 0 : headStyle === 'thin' ? 9.5 : INK.headStroke;
  ctx.save();
  if (yawR !== 0) {
    // fix 11: pivot about the neck joint — the head leans around its
    // anatomical anchor, displacing toward the content
    ctx.translate(neckX, neckY);
    ctx.rotate(yawR);
    ctx.translate(-neckX, -neckY);
  }
  ctx.translate(headCX, headCY + nod);
  // PREMIUM UPGRADE 3D-3: PSEUDO-3D HEAD TURN. The head narrows as it turns
  // (scaleX squash proportional to yaw) — a cheap 2.5D read that the head is
  // rotating in 3D, not just pivoting in 2D. At full yaw (14°) the head
  // compresses to 88% width, reading as a head turning away.
  const yawMag = Math.abs((pose.headYaw ?? 0) / AMP.headYawDeg);
  ctx.scale(faceS * (1 - 0.12 * yawMag), faceS);
  // Panel round 2: the head outline yaws ±14° about the neck; the FACE
  // rotates an additional fraction of the same term about the head's own
  // centre (+6° at full yaw) — the features lead the turn the way a real
  // head leads a look, without breaking the audit's 14° silhouette cap.
  ctx.rotate(tiltR * 0.6 + yawR * 0.45);
  // soft head shadow for depth
  ctx.fillStyle = rgba(PALETTE.shadow, 0.10);
  ctx.beginPath();
  ctx.ellipse(3, 5, 32, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  // PREMIUM UPGRADE C1: EGG HEAD. The circle (34x34) is replaced with an
  // egg ellipse (32 wide × 39 tall) + a chin extension + a nose wedge.
  // A circle reads as a ball/bullet; an egg reads as a skull. This is the
  // single highest-leverage character upgrade — the audience locks onto
  // the head first. The chin gives a jawline; the nose gives facial depth.
  ctx.fillStyle = becker ? ink : '#E8D5B7';
  ctx.strokeStyle = ink;
  ctx.lineWidth = headStroke;
  // the egg — taller than wide, slightly offset up for chin room
  ctx.beginPath();
  ctx.ellipse(0, -1, 32, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  // the chin — a subtle jaw extension below the ellipse
  ctx.beginPath();
  ctx.moveTo(-8, 33);
  ctx.quadraticCurveTo(0, 41, 8, 33);
  ctx.fill();
  if (headStroke > 0) {
    ctx.beginPath();
    ctx.ellipse(0, -1, 32, 38, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // the nose — a small wedge at mid-face (white on becker, ink on cream)
  {
    const noseCol = becker ? rgba('#FFFFFF', 0.5) : rgba(ink, 0.4);
    ctx.fillStyle = noseCol;
    ctx.beginPath();
    ctx.moveTo(2, -2);
    ctx.lineTo(7, 2);
    ctx.lineTo(2, 4);
    ctx.closePath();
    ctx.fill();
  }
  // AUDIT-ROUND-2 (fix 21 — CHARACTER RIM LIGHT): the head's upper-right
  // rim — one warm ivory arc on the light side (the film's light is
  // upper-right; every shadow already falls lower-left). An EDGE, so it
  // survives the 320px downsample; the head stops reading as a decal
  // pasted on a lit room and starts reading as an object IN the light.
  {
    ctx.strokeStyle = '#F7EFD8';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // C1: rim light follows the egg ellipse, not the old circle
    ctx.ellipse(0, -1, 32 - 1.8, 38 - 1.8, 0, -Math.PI * 0.52, -Math.PI * 0.02);
    ctx.stroke();
  }
  // eyes + glints
  // v10 (panel CHAR-2): GAZE WANDER — the look value drifts ±0.15 on a 7.4s
  // cycle. A fixed pupil for 40 seconds is the "cardboard cutout" tell;
  // the eye leading the head is what makes an illustrated character feel
  // operated. Clamped to the existing look range; deterministic in t.
  const lookBase = clamp01((r.look ?? 0) * 0.5 + 0.5) * 2 - 1;
  const look = clamp(lookBase + Math.sin(t / 7400 + seed * 1.4) * 0.15, -1, 1);
  const eyeDX = look * 7;
  // AUDIT-2 / 0.2 (report §10.1, C3) — the RAISED-COSINE BLINK. The old
  // blink was `((t + seed*700) % 4200) < 120 ? 0.12 : 1` — a single-frame
  // pop the panel read instantly ("a step"). Now: close over ~2 frames
  // (raised cosine into full closure), hold ~1, open over ~2 — a pure
  // function of t, phase-shifted per seed so two hosts never blink in
  // unison. The pop is gone; the lid lives.
  const bt = (t + seed * 700) % 4200;
  let closed = 0;
  if (bt < 60) closed = 0.5 * (1 - Math.cos((bt / 60) * Math.PI));
  else if (bt < 90) closed = 1;
  else if (bt < 150) closed = 0.5 * (1 + Math.cos(((bt - 90) / 60) * Math.PI));
  const blink = 1 - closed * 0.88;
  // AUDIT-2 / 1.2 (report §10.2, C2) — the EXPRESSION RIG, three
  // components, all pure functions of the existing pose weights:
  //   surprise  (browRaise > 0.55) → sclera eyes, DILATED pupils, arched
  //              brows (quadratic, not straight);
  //   concerned (browAngle > 8)    → half-lid overlays, inner-up brows;
  //   squint    (low browRaise + smile) → warm lids at 45%.
  // Six readable emotions (surprised / worried / skeptical / delighted /
  // deadpan / warm) from the data SceneCtx already carries.
  const surprise = clamp01((pose.browRaise - 0.55) / 0.45);
  const concerned = clamp01((pose.browAngle - 8) / 12);
  const squint = clamp01((0.35 - pose.browRaise) / 0.35) * clamp01(pose.smile) * 0.45;
  const lid = Math.max(concerned * 0.5, squint);
  const eyeOpen = blink * (1 - lid);
  // PANEL-12 / P0-5 (report §12.5) — TWO-STATE EYES. Above browRaise 0.6
  // (surprise / aha / shock) the dot eyes open into 6.2px white sclera
  // with ink pupils (+ AUDIT-2 dilation on surprise); below the threshold
  // the dots stay (calm register). C4: dot radius 4.6 → 5.2 so the face
  // survives the 320px feed referee.
  // P1-4 (audit Table 3): per-eye SILHOUETTE scale — pose.eyeL/eyeR (the
  // wry squint-smirk 0.55/1.12, warm 1.15) multiplies each eye's radii:
  // emotions that change SHAPES survive the phone gate. And P1-1
  // 'becker': white dot eyes on the solid ink head — the sclera swap
  // never fires (no interior clutter; the tilt + scale carry it).
  const eyeSL = pose.eyeL ?? 1;
  const eyeSR = pose.eyeR ?? 1;
  // AUDIT-ROUND-2 (fix 9 — FACE FLOOR AT SCALE): the dot eyes at the
  // standard host rig scale (2.05) were 5.4 rig units — ~11px radius at
  // 1080p, under 2px at the 320px feed gate ("the smile/eyes collapse
  // into gray mush"). Scale-coupled floor: above rig scale 1.5 the eyes
  // STOP SHRINKING WITH THE RIG AND ENLARGE — 7.5 rig units (≈15px radius
  // at 1080p, 2.5px at the gate on the solid-ink head where the white
  // dots carry their own contrast), spacing ±11 kept. The reaction
  // close-ups already proved the mechanism (they scored highest).
  const eyeFloorR = scale > 1.5 ? 7.5 : 5.4;
  if (becker) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, eyeFloorR * eyeSL, eyeFloorR * eyeOpen * eyeSL, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, eyeFloorR * eyeSR, eyeFloorR * eyeOpen * eyeSR, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (pose.browRaise > 0.55) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, 6.2 * eyeSL, 6.2 * eyeOpen * eyeSL, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, 6.2 * eyeSR, 6.2 * eyeOpen * eyeSR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    const pupR = 3.4 * (1 + surprise * 0.28); // AUDIT-2: pupil dilation
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, pupR * eyeSL, pupR * eyeOpen * eyeSL, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, pupR * eyeSR, pupR * eyeOpen * eyeSR, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, 5.2 * eyeSL, 5.2 * eyeOpen * eyeSL, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, 5.2 * eyeSR, 5.2 * eyeOpen * eyeSR, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // AUDIT-2 / 1.2: the eyelid line — when a lid is active, an ink stroke
  // rides the lid's lower edge so the squint/concern reads as anatomy,
  // not as a shorter eye.
  if (lid > 0.08 && !becker) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    const lidY = -6 - 5.2 * (1 - lid);
    ctx.beginPath();
    ctx.moveTo(-16 + eyeDX, lidY);
    ctx.lineTo(-6 + eyeDX, lidY - 1.5);
    ctx.moveTo(6 + eyeDX, lidY - 1.5);
    ctx.lineTo(16 + eyeDX, lidY);
    ctx.stroke();
  }
  // AUDIT-ROUND-2 (fix 9 — the bold white brow arcs on the becker head):
  // the solid-ink head carried "zero interior clutter" right up to the
  // point where it carried NO expression hardware above the eyes — the
  // audit's prescription: "one bold white brow arc on becker head (reads
  // at distance, carries surprise)". TWO arcs now — one per eye — bold
  // (4.6px), white, arching with browRaise (the surprise read) and
  // kinking with browAngle (the concern read). They live ABOVE the
  // enlarged eyes, still inside the head's silhouette: the face gains
  // its last expression channel without surrendering the
  // silhouette-first design.
  if (becker) {
    const bRaise = pose.browRaise * AMP.browTravelPx;
    const bAng = pose.browAngle * D2R;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4.6;
    ctx.lineCap = 'round';
    const browArc = (dir: number): void => {
      const x0 = dir * (6 + eyeDX), x1 = dir * (19 + eyeDX);
      const y0 = -19 - bRaise - dir * Math.tan(bAng) * 6;
      const y1 = -17 - bRaise + dir * Math.tan(bAng) * 6 * -1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      // the ARCH — quadratic lift keyed to browRaise (surprise curves,
      // calm stays near-straight)
      ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 4.5 - 7 * clamp01(pose.browRaise), x1, y1);
      ctx.stroke();
    };
    browArc(-1);
    browArc(1);
  }
  if (!becker) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(-9.5 + eyeDX, -7.5, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12.5 + eyeDX, -7.5, 1.9, 0, Math.PI * 2); ctx.fill();
  } // P1-1 'becker': no glints — zero interior clutter
  // brows (existing semantics) — AUDIT-2 / 1.2: THREE SHAPES per side.
  //   neutral    straight stroke (the house brow);
  //   raised     quadratic ARCH on surprise — the brow lifts and curves,
  //              which the straight line could never communicate;
  //   concerned  inner-end-up kink at browAngle > 10 — worry reads in the
  //              angle break, not just the lift.
  // P1-1 'becker': no brows — the eye scale + head tilt + mouth carry the
  // emotion (zero interior clutter is the whole point of the solid head).
  if (!becker) {
  const bRaise = pose.browRaise * AMP.browTravelPx;
  const bAngle = pose.browAngle * D2R;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  const browSide = (dir: number): void => {
    const x0 = dir * (6 + eyeDX), x1 = dir * (20 + eyeDX);
    // BLUEPRINT Phase 1: the arch/kink amplitudes scale with the x2.8
    // brow travel so the SHAPES read at the new height (a 5.5px arch on
    // a 14px raise would flatten back into a line).
    const y0 = -20 - bRaise - dir * Math.tan(bAngle) * 7;
    const y1 = -18 - bRaise + dir * Math.tan(bAngle) * 7 * -1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    if (surprise > 0.35) {
      ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 9.5 * surprise, x1, y1);
    } else if (concerned > 0.35) {
      const kx = x0 + (x1 - x0) * 0.34;
      ctx.lineTo(kx, y0 - 5.5 * concerned);
      ctx.lineTo(x1, y1);
    } else {
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  };
  browSide(-1);
  browSide(1);
  }
  // AUDIT-3 / §3.1 (report Phase 3.1 — DIFFERENTIATE CHARACTER TWO): the
  // 'prof' variant's round glasses. Two BOLD stroked circles with a light
  // lens fill + a bridge — sized to survive the 320px feed (the round-5
  // panel: "glasses only work if they're drawn oversized/bold enough to
  // survive the thumbnail pass"). At the coffee character's 0.75× the
  // lenses read as a face accessory, not facial texture.
  if (prof) {
    // the lens fill — a light wash so the frames read as GLASSES,
    // not as two more face lines
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(-11 + eyeDX, -5.5, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(11 + eyeDX, -5.5, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    // lenses — centered on the eye line, oversized on purpose
    ctx.beginPath();
    ctx.arc(-11 + eyeDX, -5.5, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11 + eyeDX, -5.5, 13, 0, Math.PI * 2);
    ctx.stroke();
    // the bridge
    ctx.beginPath();
    ctx.moveTo(-2 + eyeDX, -8.5);
    ctx.lineTo(2 + eyeDX, -8.5);
    ctx.stroke();
  }
  // mouth (v3: articulate talk envelope when speaking, panel P0-4)
  // BLUEPRINT Phase 2: the reaction jaw multiplier reaches the mouth.
  // P1-1: becker draws it in white on the solid head.
  // 100-JUDGE AUDIT (Part 8.2): the mouth now takes a viseme hint, derived
  // from the active word's first letter via visemeAt(). The same wordTimes
  // array that drives the talk envelope also drives the viseme — zero
  // additional data flow cost. The host call site passes the beat's word
  // texts; without them the viseme defaults to 'X' (the original envelope).
  {
    let vm: import('./stickman-v2').Viseme = 'X';
    if (r.talk && (r.talk > 0.15) && (r as any).wordTexts && (r as any).wordTimes) {
      vm = visemeAt((r as any).beatT ?? 0, (r as any).wordTimes ?? [], (r as any).wordTexts ?? []);
    }
    drawMouthV2(ctx, eyeDX, pose.smile, r.talk ?? 0, jaw2x, becker ? '#FFFFFF' : PALETTE.ink, scale > 1.5, vm);
  }
  // cheek warmth — very subtle (P1-1 'becker': skipped — no interior clutter)
  if (!becker) {
    ctx.fillStyle = rgba(PALETTE.down, 0.16);
    ctx.beginPath(); ctx.ellipse(-21, 7, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(21, 7, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}
