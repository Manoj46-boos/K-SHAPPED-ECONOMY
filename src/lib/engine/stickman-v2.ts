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

import { PALETTE, rgba, roundRect } from './theme';
import { clamp, clamp01, hash01 } from './easing';
import { registerRect } from './collision';
import { camState } from './effects';
import { AMP, INK } from './perception';

const D2R = Math.PI / 180;

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
  col: string = PALETTE.ink
): void {
  const mx = eyeDX * 0.6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = col;
  // AUDIT-2 / 0.6 (report §10.1, C2): the FOUR-SHAPE mouth. The old
  // two-state system (smile arc | one open ellipse) flapped; these
  // thresholds (0.18 / 0.55 / 0.85) carve the SAME talk envelope into
  // closed / small-open / wide-open / round-O shapes — articulation
  // from data the engine already receives.
  if (talk > 0.85) {
    // the round "O" — peak openness: taller than wide, reads at distance
    const w = 6.5 + (talk - 0.85) * 12;
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
    const w = 7.5 + talk * 3;
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
    const w = 6 + talk * 4;
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
  taper(ctx, x, y, jx, jy, w0, wJ, col);
  taper(ctx, jx, jy, ex, ey, wJ, w1, col);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(ex, ey, w1 * 0.72, 0, Math.PI * 2);
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
  if (rigScale < 0.85) {
    // ── the MITTEN: palm mass + opposed thumb ──
    const bx = x + Math.sin(a) * s * 0.14;
    const by = y + Math.cos(a) * s * 0.14;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(
      bx + Math.sin(a) * s * 0.16, by + Math.cos(a) * s * 0.16,
      s * 0.36, s * 0.5, a, 0, Math.PI * 2
    );
    ctx.fill();
    // the opposed thumb — the pincer that keeps small gestures legible
    taper(ctx, bx, by,
      bx + Math.sin(a - 1.25) * s * 0.52, by + Math.cos(a - 1.25) * s * 0.52,
      s * 0.34, s * 0.18, col);
    return;
  }
  // ── the BOLD MITT (side-host scale 0.85–2.0) ──
  // P1-2 (audit Table 3) panel round 3: "commit to either a bold
  // simplified mitt or genuinely larger articulated geometry — not three
  // hairline prongs." At side-host scale the hand is ~25-30px — no
  // interior anatomy survives. The confident silhouette: a rounded palm
  // ~2× the arm's width with a SEPARATED thumb (a real gap — the notch
  // read that makes a mitt read as a HAND) — the Kurzgesagt/PolyMatter
  // hand. The articulated fan waits for true hero scale below.
  if (rigScale < 2.0) {
    // the MITT — 1.6s × 2.0s (≈2.2× the forearm's end width), generous
    // radii, drawn in the arm's rotated frame (round-4 math: the round-3
    // mitt at 0.68s was THINNER than the arm — the "shrunken claw").
    ctx.save();
    ctx.translate(x + Math.sin(a) * s * 0.5, y + Math.cos(a) * s * 0.5);
    ctx.rotate(a);
    ctx.fillStyle = col;
    roundRect(ctx, -s * 0.8, -s * 1.0, s * 1.6, s * 2.0, s * 0.5);
    ctx.fill();
    ctx.restore();
    // the THUMB (panel round 5: "enlarge ~2x, anchor to the mitt's lower
    // edge, angle outward — the gap reads as a V-notch, not two unrelated
    // blobs") — a thick taper rooting INSIDE the mitt's base corner and
    // exiting past it, so background cuts a V between thumb and palm
    ctx.save();
    ctx.translate(x + Math.sin(a) * s * 0.5, y + Math.cos(a) * s * 0.5);
    ctx.rotate(a);
    taper(ctx, s * 0.5, -s * 0.5, s * 1.42, -s * 1.12, s * 0.56, s * 0.3, col);
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
 * The v2 tails were two stroked quadratics — lines, not cloth. This is a
 * filled ribbon with real width, an S-curve, and a two-tone underside
 * (gold face over a goldDeep under-panel offset 3px down-left): it reads
 * as a tied scarf with volume at hero scale and as a solid gold mark at
 * phone scale. The wave keeps its sine (velocity-coupled in P1-4 at the
 * call site below).
 */
function scarfTail(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number,        // below the knot
  wave: number,                  // the existing Math.sin(t / 700 + seed) * 6
  colTop: string, colUnder: string
): void {
  // P1-3 (100-judge audit, Table 3 — SCARF AS CLOTH): the filled ribbon
  // still read as "two flat overlapping rectangles — bandana clip-art,
  // zero folds" because it WAS two flat shapes (the two-tone offset
  // pair) on one smooth curve. The cloth pass:
  //   (1) FOLD BREAK — the tail bends sharply at ~55% length: two ribbon
  //       segments meeting at an angle (a real crease), not one smooth
  //       quadratic;
  //   (2) UNDER-SHADOW — a goldDeep stroke where the tail's root passes
  //       under the knot's edge (fabric over fabric, grounded);
  //   (3) the two-tone underside survives as the fold's shading.
  const half = 6.5;
  const fxp = x0 - 8 + wave;            // the fold point (~55% out)
  const fyp = y0 + 42;
  const ex = x0 - 24 + wave * 1.5;     // the tail end, past the fold
  const ey = y0 + 78;
  const ribbon = (dx: number, dy: number, col: string): void => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x0 + dx - half, y0 + dy);
    ctx.quadraticCurveTo(x0 + dx - 14 + wave * 0.4, y0 + dy + 20, fxp + dx - half * 0.8, fyp + dy);
    ctx.lineTo(fxp + dx + half * 0.8, fyp + dy);
    ctx.quadraticCurveTo(ex + dx + half * 0.5, fyp + dy + 18, ex + dx + half * 0.6, ey + dy);
    ctx.lineTo(ex + dx - half * 0.6, ey + dy);
    ctx.quadraticCurveTo(ex + dx - 3, fyp + dy + 14, fxp + dx - half * 0.8, fyp + dy);
    ctx.lineTo(x0 + dx + half, y0 + dy);
    ctx.closePath();
    ctx.fill();
  };
  ribbon(0, 3, colUnder);
  ribbon(3, 0, colTop);
  // (1) the fold line — the crease itself
  ctx.strokeStyle = colUnder;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fxp - half * 0.9, fyp - 2);
  ctx.lineTo(fxp + half * 0.9, fyp + 2);
  ctx.stroke();
  // (2) the under-shadow — the tail passing under the knot's edge
  ctx.strokeStyle = rgba(colUnder, 0.6);
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(x0 - half + 1, y0 + 12);
  ctx.quadraticCurveTo(x0 - 12 + wave * 0.3, y0 + 26, fxp - half * 0.6, fyp - 6);
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
  const g = ctx.createRadialGradient(-4 + skewX, 4, 8, -4 + skewX, 4, 120);
  g.addColorStop(0, rgba(PALETTE.shadow, 0.30));
  g.addColorStop(0.55, rgba(PALETTE.shadow, 0.12));
  g.addColorStop(1, rgba(PALETTE.shadow, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-4 + skewX, 8, 118, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(PALETTE.shadow, 0.35);
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
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, groundY);
  // AUDIT-3 / §2.4: the squash rides the figure transform ABOUT the
  // ground-contact origin (translate happens before scale, so the feet
  // stay planted while the body compresses).
  if (squash > 0.001) ctx.scale(1 + 0.06 * squash, 1 - 0.09 * squash);
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
  if ((r.shadow ?? 1) > 0) groundShadowV2(ctx, 0, 0, 1, r.shadowSkew ?? 0, r.shadowRot ?? 0);

  const ink = PALETTE.ink;
  // AUDIT-3 / Finding 1 (report §3.2 + Phase 1.1): ONE INK VALUE PER
  // CHARACTER (see the long note above — depth from overlap and contact,
  // never from splitting limb values).
  const farInk = ink;
  ctx.save();
  ctx.globalAlpha = alpha;
  // BLUEPRINT Phase 2 (report §11, INK register): the phone feed rewards
  // DARK MASS on pale ground — limb weights rise so the figure carries
  // the frame's identity at 320px (far leg 12/10/9 -> 17/13/10, far arm
  // 9/8/7 -> 13/10/8).
  const farFoot = limb2(ctx, hipLX, hipLY, pose.lLU, pose.lLL, U_LEG, L_LEG, INK.legFar[0], INK.legFar[1], INK.legFar[2], farInk, pose.lLift ?? 0);
  const farHand = limb2(ctx, neckX - 4 + Math.sin(shT) * -4, neckY + 3 + Math.sin(shT) * 9 - (pose.shoulderDrop ?? 0) * 0.6, pose.lAU, pose.lAL, U_ARM, L_ARM, INK.armFar[0], INK.armFar[1], INK.armFar[2], farInk);
  handGlyph(ctx, farHand.ex, farHand.ey, pose.lAL, 12, farInk, scale, pose.lHand); // P1-2 r3
  ctx.restore();

  // NEAR leg (support) — P0-3: both feet now get a shoe, slightly
  // oversized and forward-set.
  // BLUEPRINT Phase 2 (INK): near leg 15/12/10 -> 21/16/12 — the support
  // leg is the figure's anchor mass.
  const nearFoot = limb2(ctx, hipRX, hipRY, pose.rLU, pose.rLL, U_LEG, L_LEG, INK.legNear[0], INK.legNear[1], INK.legNear[2], ink, pose.rLift ?? 0);
  // AUDIT-2 / 0.1: the far shoe steps with its limb (farInk); the near
  // shoe stays full ink — depth, not a second colour system.
  // AUDIT-3 / Walk 3.0 (§2.6): the shoe PITCHES with the stride (lToe/rToe
  // from walkPose) — heel-strike (toe up) through toe-off (toe down).
  // BLUEPRINT Phase 2 (report §11): the 18x8.5 ELLIPSE becomes a DRAWN
  // WEDGE with a heel counter, instep and toe box — 29px long at rig
  // scale so the ±26° toe roll finally has a lever arm (the audit's
  // “blob feet, no toe” and the walk panel's “flat paddle” both die
  // here). Rotates about the ankle; the sole rides the ground line.
  const shoeWedge = (f: { ex: number; ey: number }, col: string, rotDeg = 0): void => {
    ctx.save();
    ctx.translate(f.ex, f.ey - 4);
    ctx.rotate(rotDeg * D2R);
    ctx.fillStyle = col;
    ctx.beginPath();
    // heel counter — rounded back of the shoe
    ctx.moveTo(-7.5, -4);
    ctx.quadraticCurveTo(-10.5, 1, -8, 7);
    // sole — flat contact line with a hint of toe-spring at the front
    ctx.lineTo(13, 8.2);
    ctx.quadraticCurveTo(20.5, 8.4, 22, 5.4);
    // toe box — the rounded front cap that reads as a SHOE
    ctx.quadraticCurveTo(23.4, 2.2, 20.5, 0.4);
    // instep — dips up to the ankle
    ctx.quadraticCurveTo(13, -1.4, 4, -3.6);
    ctx.quadraticCurveTo(-3, -5.4, -7.5, -4);
    ctx.closePath();
    ctx.fill();
    // the sole line — a slightly darker pass under the wedge so the
    // ground contact reads (one light, shadow tone)
    ctx.strokeStyle = rgba(PALETTE.shadow, 0.55);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-7.5, 7.6);
    ctx.quadraticCurveTo(6, 8.6, 19, 6.6);
    ctx.stroke();
    ctx.restore();
  };
  shoeWedge(farFoot, farInk, pose.lToe ?? 0);
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

  // torso — tapered spine. P0-5: the taper bias inverts (15 at the hips,
  // 22 at the shoulders) — narrower hips, wider shoulders, grounded
  // anatomy (the v2 bias was near-uniform).
  // AUDIT-3 / §3.1: the 'prof' variant widens the taper (19.5/27.5) — a
  // stockier silhouette that reads as a different build, not a scaled
  // copy of the host (Finding C-3, “copy-paste coworker”).
  const prof = r.variant === 'prof';
  // BLUEPRINT Phase 2 (INK): torso taper 15/22 -> 19/30 (prof 24/35) —
  // the chest mass the stocky silhouette needs at phone scale.
  taper(ctx, 0, pelvisY + 4, neckX, neckY, prof ? 24 : INK.torso[0], prof ? 35 : INK.torso[1], ink);
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
  // P1-6 (audit Table 3 — GRADUATED SMEARS): the single 0.35-alpha ghost
  // above the 0.25 threshold read as nothing mid-gesture ("arms are
  // passive stumps"). THREE ghosts now, graduated 0.30/0.18/0.09, offset
  // on BOTH segments (upper arm and forearm rotate apart), fired from
  // 0.12 so the trail exists through the whole gesture spring — the
  // fastest limb in the frame finally carries a motion trail.
  if ((r.smear ?? 0) > 0.12) {
    const sm = clamp01(r.smear ?? 0);
    // panel round-3 root cause: the ghost offsets (1.8-7.6°) were SMALLER
    // than the arm's own angular width — atan(2·halfW/forearm) ≈ 17° at
    // rig scale — so every ghost hid UNDER the solid stroke (this is also
    // why the audit never saw the old single 2.4° ghost). The offsets now
    // clear the arm: ghost 1 half-overlaps (reads as the blend edge),
    // ghosts 2-3 sweep clear of it along the gesture arc.
    const ghosts: Array<[number, number, number]> = [
      [4, 16, 0.42],
      [8, 27, 0.26],
      [12, 38, 0.13],
    ];
    for (const [dAU, dAL, aMul] of ghosts) {
      ctx.save();
      ctx.globalAlpha = alpha * aMul * sm;
      limb2(ctx, neckX + 4 + Math.sin(shT) * 4, neckY + 3 - Math.sin(shT) * 9 + shDrop, pose.rAU + dAU, pose.rAL + dAL, U_ARM, L_ARM, INK.armNear[0], INK.armNear[1], INK.armNear[2], ink);
      ctx.restore();
    }
  }
  // BLUEPRINT Phase 2: near arm 13/11/9 -> 17/13/10 (INK.armNear); the
  // shoulder anchor rides the shoulder-line counter-tilt (Phase 2's
  // second rotation term — the near shoulder rises when shT is positive)
  // and the P1-4 shoulder drop.
  const hand = limb2(ctx, neckX + 4 + Math.sin(shT) * 4, neckY + 3 - Math.sin(shT) * 9 + shDrop, pose.rAU, pose.rAL, U_ARM, L_ARM, INK.armNear[0], INK.armNear[1], INK.armNear[2], ink);
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
  const headCX = neckX + Math.sin(tiltR) * (10 + 33 * 0.9);
  const headCY = neckY - Math.cos(tiltR) * (10 + 33 * 0.9);
  const nod = (r.nod ?? 0) * 4;
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
  ctx.translate(headCX, headCY + nod);
  ctx.scale(faceS, faceS);
  ctx.rotate(tiltR * 0.6);
  // soft head shadow for depth
  ctx.fillStyle = rgba(PALETTE.shadow, 0.10);
  ctx.beginPath();
  ctx.arc(3, 5, 34, 0, Math.PI * 2);
  ctx.fill();
  // AUDIT-PHASE-2: head fill switches from bgTop (white) to warm cream
  // (#E8D5B7) — the head reads as a SOLID MASS at any scale, not a thin
  // outline on white. Carries the silhouette the way Alan Becker's
  // stickman heads do (filled, not outlined).
  // P1-1: 'becker' goes one step further — the WHOLE head is ink; the
  // features draw in white on top. 'thin' keeps the cream head but draws
  // the ring at 9.5px — a line, not a hood.
  ctx.fillStyle = becker ? ink : '#E8D5B7';
  ctx.strokeStyle = ink;
  ctx.lineWidth = headStroke; // P1-1: 14 -> 9.5 ('thin') — the outline is a
  // drawn line again; the "ninja hood" ring is gone.
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();
  if (headStroke > 0) ctx.stroke();
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
  if (becker) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, 5.4 * eyeSL, 5.4 * eyeOpen * eyeSL, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, 5.4 * eyeSR, 5.4 * eyeOpen * eyeSR, 0, 0, Math.PI * 2);
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
  if (lid > 0.08) {
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
  drawMouthV2(ctx, eyeDX, pose.smile, r.talk ?? 0, jaw2x, becker ? '#FFFFFF' : PALETTE.ink);
  // cheek warmth — very subtle (P1-1 'becker': skipped — no interior clutter)
  if (!becker) {
    ctx.fillStyle = rgba(PALETTE.down, 0.16);
    ctx.beginPath(); ctx.ellipse(-21, 7, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(21, 7, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}
