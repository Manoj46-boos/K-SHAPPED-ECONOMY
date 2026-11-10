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
  talk: number
): void {
  const mx = eyeDX * 0.6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.ink;
  // AUDIT-2 / 0.6 (report §10.1, C2): the FOUR-SHAPE mouth. The old
  // two-state system (smile arc | one open ellipse) flapped; these
  // thresholds (0.18 / 0.55 / 0.85) carve the SAME talk envelope into
  // closed / small-open / wide-open / round-O shapes — articulation
  // from data the engine already receives.
  if (talk > 0.85) {
    // the round "O" — peak openness: taller than wide, reads at distance
    const w = 6.5 + (talk - 0.85) * 12;
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.ellipse(mx, 15, w, w * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FDFCF8';
    ctx.beginPath();
    ctx.ellipse(mx, 15 - w * 0.55, w * 0.5, w * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (talk > 0.55) {
    // wide-open articulate jaw (the v3 shape, retuned)
    const w = 7.5 + talk * 3;
    const h = 4 + (talk - 0.55) * 16;
    ctx.fillStyle = PALETTE.ink;
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
    const h = 2.5 + talk * 6.5;
    ctx.fillStyle = PALETTE.ink;
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
function boilReset(t: number): void {
  boilT = t;
  boilJoint = 0;
}
function boilOff(): { dx: number; dy: number } {
  if (boilT < 0) return { dx: 0, dy: 0 };
  const phase = Math.floor(boilT / BOIL_MS) % 3;
  const j = boilJoint++;
  return {
    dx: (hash01(j * 17.31 + phase * 7.7) - 0.5) * 1.7,
    dy: (hash01(j * 29.7 + phase * 11.3 + 5) - 0.5) * 1.7,
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
function handGlyph(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,          // hand position from limb2()
  forearmAngle: number,          // the pose's lower-arm angle, degrees
  s: number, col: string,        // s ≈ 13 at scale 1, grows with rig scale
  small = false                  // AUDIT-2 / 1.3: mitten variant below scale 1
): void {
  const a = forearmAngle * D2R;
  if (small) {
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
  // ── the FAN (hero scale ≥ 1.0) ──
  // the fan: index..outer, splayed. Panel re-review calibration round 2:
  // (1) fingers now root PAST the wrist point (+0.18s along the forearm) —
  // the forearm's round cap was swallowing the finger bases and the whole
  // palm zone read as one blob; (2) base mass up again (0.72s) with the
  // same whip tip (0.22s) so the thick-to-thin read survives a 320px feed;
  // (3) the thumb's opposing angle opens −66° → −77° and it thickens to
  // 0.72s at the base — a pincer you can read mid-gesture.
  const bx = x + Math.sin(a) * s * 0.18;
  const by = y + Math.cos(a) * s * 0.18;
  const fingers: Array<[number, number, number]> = [
    [-0.50, 0.92, 0.95], [-0.12, 1.14, 1.1], [0.28, 0.96, 1.0],
  ];
  for (const [off, len, wid] of fingers) {
    taper(ctx, bx, by, bx + Math.sin(a + off) * s * len,
      by + Math.cos(a + off) * s * len, s * 0.72 * wid, s * 0.22 * wid, col);
  }
  // the OPPOSED thumb — ~77° against the fan, thick at the base, short:
  // the pincer that makes "holding" readable
  taper(ctx, bx, by, bx + Math.sin(a - 1.35) * s * 0.68,
    by + Math.cos(a - 1.35) * s * 0.68, s * 0.72, s * 0.26, col);
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
  const x1 = x0 - 12 + wave, y1 = y0 + 74;      // tail end
  const cx = x0 - 22 + wave * 0.5, cy = y0 + 38;
  // under-panel first (darker gold), then top ribbon offset 3px up-right
  for (const [col, dx, dy] of [[colUnder, 0, 3], [colTop, 3, 0]] as Array<[string, number, number]>) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x0 + dx - 6.5, y0 + dy);
    ctx.quadraticCurveTo(cx + dx - 5, cy + dy, x1 + dx - 4, y1 + dy);
    ctx.lineTo(x1 + dx + 4, y1 + dy);
    ctx.quadraticCurveTo(cx + dx + 5, cy + dy, x0 + dx + 6.5, y0 + dy);
    ctx.closePath();
    ctx.fill();
  }
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
     * registration moves with the pixels — the guard stays exact. */
    parallax?: boolean;
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
  },
  seed = 0
): void {
  const pose0 = r.pose;
  const alpha = r.alpha ?? 1;
  if (alpha <= 0.001) return;
  // AUDIT-2 / 1.1: arm the boil clock for this draw — every limb2() call
  // from here down jitters on the quantized 3-phase clock (pure function of
  // t, so scrub-determinism survives).
  boilReset(t);
  // AUDIT-3 / §2.4 (report Phase 2.4 — SQUASH ON LANDINGS): 0..1 body
  // squash about the ground contact (feet stay planted, everything above
  // compresses 6% and widens 5% — volume-preserving). Driven by a short
  // decaying pulse at slam/landing times. Applied inside the figure
  // transform stack below, after translate(cx, groundY). Pure function of
  // caller data.
  const squash = r.squash ?? 0;
  // P2-1: foreground parallax — the figure translates at 1.40× the camera
  // drift (the stage already rides the camera's 1.0×).
  // AUDIT-2 / §10.3 (D1): 0.25 → 0.40. At the old factor the differential
  // motion topped out ~6px — below the 8-12px phone-viewing threshold the
  // panel set for plane separation; 0.40 + the raised camera register
  // (§10.3) clears it on every layered scene.
  let cx = cx0;
  let groundY = groundY0;
  if (r.parallax) {
    cx += camState.dx * 0.40;
    groundY += camState.dy * 0.40;
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
  if (squash > 0.001) ctx.scale(1 + 0.05 * squash, 1 - 0.06 * squash);
  ctx.scale(r.flip ? -scale : scale, scale);
  // v6 idle life: a 2.4s breath sway (±0.23°) around the ground contact —
  // the freeze between sentences read as a mannequin without it.
  ctx.rotate(Math.sin(t / 2400 + seed * 1.7) * 0.004);
  // v10 (panel CHAR-2): WEIGHT SHIFT — a slow 4.6s hip settle.
  // AUDIT-3 / §2.2 (report Phase 2.2 — CONTRAPPOSTO IDLE): the terms were
  // sub-pixel at phone scale (±1.8px at scale 1.0), which is why the
  // BEFORE renders still read “mannequin between sentences”. Amplitude
  // rises to ±3.0px and the shift now DRIVES a shoulder counter-angle
  // (±1.6° on the arm roots against the hip) — hips and shoulders oppose
  // each other, the classical contrapposto line, visible at 320px.
  const weight = Math.sin(t / 4600 + seed * 2.3) * 3.0;
  const counter = Math.sin(t / 4600 + seed * 2.3);
  ctx.translate(weight, 0);
  ctx.rotate(Math.sin(t / 6200 + seed * 0.9) * 0.003);
  // the pose-level contrapposto offsets (applied on a COPY — callers'
  // pose objects are never mutated)
  const pose: import('./stickman').Pose = {
    ...pose0,
    lAU: pose0.lAU - counter * 1.6,
    rAU: pose0.rAU + counter * 1.6,
  };
  // PANEL-12 / P0-5 (report §12.5): PROPORTIONS — shorter legs, bigger
  // head, stockier torso. TORSO 96→88, U_LEG 72→64, L_LEG 66→58: the v2
  // figure was 7.2 heads tall on pin legs — the panel read "coat hanger".
  // The new stack is ~6.4 heads and reads "person". Head stroke 8→9 so
  // the face keeps its ink weight at the shorter scale.
  const U_LEG = 64, L_LEG = 58, TORSO = 88, U_ARM = 58, L_ARM = 54;
  const pelvisY = -U_LEG - L_LEG + pose.rootY;
  const leanR = pose.lean * D2R;
  const neckX = Math.sin(leanR) * TORSO;
  const neckY = pelvisY - Math.cos(leanR) * TORSO;

  // ground (v2 layered shadow; P3-2 skew + P3-3 one-light offset inside)
  if ((r.shadow ?? 1) > 0) groundShadowV2(ctx, 0, 0, 1, r.shadowSkew ?? 0, r.shadowRot ?? 0);

  const ink = PALETTE.ink;
  // AUDIT-3 / Finding 1 (report §3.2 + Phase 1.1): ONE INK VALUE PER
  // CHARACTER. The AUDIT-2 attempt replaced the old 0.62 alpha with a
  // 28% value step (hexLerp toward the background) — still a two-tone
  // limb system, and the 100-judge re-verification of the BEFORE render
  // convicted it again, independently, three times: “the gray-to-dark
  // two-tone limbs look like a rigging error… one arm gray, the other
  // dark… at feed scale the character loses a limb”. The report's fix is
  // exactly one line and it is the highest-leverage change in the audit:
  // draw far limbs in the SAME ink. Depth comes from overlap, contact and
  // the ground shadow — never from splitting limb values (the Alan
  // Becker reference rule the owner chose).
  const farInk = ink;
  ctx.save();
  ctx.globalAlpha = alpha;
  const farFoot = limb2(ctx, -6, pelvisY, pose.lLU, pose.lLL, U_LEG, L_LEG, 12, 10, 9, farInk, pose.lLift ?? 0);
  const farHand = limb2(ctx, neckX - 4, neckY + 3, pose.lAU, pose.lAL, U_ARM, L_ARM, 9, 8, 7, farInk);
  handGlyph(ctx, farHand.ex, farHand.ey, pose.lAL, 10, farInk, scale < 1);
  ctx.restore();

  // NEAR leg (support) — P0-3: both feet now get a shoe, slightly
  // oversized and forward-set. The far foot used to get NOTHING: at
  // phone scale a one-shoed figure reads as an error, and the panel
  // called the oversized forward shoe "an instant silhouette hook from
  // the ankles down".
  const nearFoot = limb2(ctx, 6, pelvisY, pose.rLU, pose.rLL, U_LEG, L_LEG, 15, 12, 10, ink, pose.rLift ?? 0);
  // AUDIT-2 / 0.1: the far shoe steps with its limb (farInk); the near
  // shoe stays full ink — depth, not a second colour system.
  // AUDIT-3 / Walk 3.0 (§2.6): the shoe PITCHES with the stride (lToe/rToe
  // from walkPose) — heel-strike (toe up) through toe-off (toe down), so
  // the foot rolls through the step instead of sliding flat.
  const shoe = (f: { ex: number; ey: number }, col: string, rotDeg = 0): void => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(f.ex + 11, f.ey - 3, 18, 8.5, rotDeg * D2R, 0, Math.PI * 2);
    ctx.fill();
  };
  shoe(farFoot, farInk, pose.lToe ?? 0);
  shoe(nearFoot, ink, pose.rToe ?? 0);

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
  taper(ctx, 0, pelvisY + 4, neckX, neckY, prof ? 19.5 : 15, prof ? 27.5 : 22, ink);

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
    const wave =
      Math.sin(t / 700 + seed) * 6 * (r.walkPhase !== undefined ? 3.2 : 1);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.ellipse(neckX, neckY + 7, 13, 8, leanR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // v10 (panel CHAR-3): a goldDeep outline on the knot — at side-host
    // scale the solid knot read as "a stain"; the two-tone knot reads as
    // a tied scarf at any size.
    ctx.strokeStyle = PALETTE.goldDeep;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(neckX, neckY + 7, 13, 8, leanR * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    // the ribbon — width, S-curve, two-tone underside (was 2 stroked lines)
    // AUDIT-3 / §1.3 (report Phase 1.3 — the mitten lesson applied to
    // cloth): below rig scale 1.2 the ribbon collapses into a smear at
    // phone-feed scale (Finding C-8: “the gold scarf becomes a smear”).
    // Below 1.2 the scarf is the KNOT ONLY — a clean brand mark, never mush.
    if (scale >= 1.2) {
      scarfTail(ctx, neckX - 3, neckY + 11, wave, PALETTE.gold, '#A8851B');
    }
  }

  // NEAR arm — capture the hand so props ride it (v5, audit P1-3)
  // AUDIT-2 / §10.3 (report §4.2): the generalized SMEAR on word-onset
  // forearm strikes — the same double-draw bigText uses, on the limb that
  // moves fastest. A 0.35-alpha ghost at +2.4°/+3.2° angle offset UNDER
  // the solid arm reads as motion blur for the 300ms the accent pulse
  // swings the forearm 16°.
  if ((r.smear ?? 0) > 0.25) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.35 * (r.smear ?? 0);
    limb2(ctx, neckX + 4, neckY + 3, pose.rAU + 2.4, pose.rAL + 3.2, U_ARM, L_ARM, 13, 11, 9, ink);
    ctx.restore();
  }
  const hand = limb2(ctx, neckX + 4, neckY + 3, pose.rAU, pose.rAL, U_ARM, L_ARM, 13, 11, 9, ink);
  // P0-2 + AUDIT-2 / 1.3 (report §10.2, C5): TWO GLYPHS — the fan at hero
  // scale, the mitten below rig scale 1.0, selected right here.
  handGlyph(ctx, hand.ex, hand.ey, pose.rAL, 13, ink, scale < 1);
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
  ctx.save();
  ctx.translate(headCX, headCY + nod);
  ctx.scale(faceS, faceS);
  ctx.rotate(tiltR * 0.6);
  // soft head shadow for depth
  ctx.fillStyle = rgba(PALETTE.shadow, 0.10);
  ctx.beginPath();
  ctx.arc(3, 5, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.bgTop;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 9; // P0-5: 8→9 — keeps face ink weight at the stockier scale
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
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
  if (pose.browRaise > 0.55) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, 6.2, 6.2 * eyeOpen, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, 6.2, 6.2 * eyeOpen, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    const pupR = 3.4 * (1 + surprise * 0.28); // AUDIT-2: pupil dilation
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, pupR, pupR * eyeOpen, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, pupR, pupR * eyeOpen, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, 5.2, 5.2 * eyeOpen, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, 5.2, 5.2 * eyeOpen, 0, 0, Math.PI * 2);
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
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(-9.5 + eyeDX, -7.5, 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(12.5 + eyeDX, -7.5, 1.9, 0, Math.PI * 2); ctx.fill();
  // brows (existing semantics) — AUDIT-2 / 1.2: THREE SHAPES per side.
  //   neutral    straight stroke (the house brow);
  //   raised     quadratic ARCH on surprise — the brow lifts and curves,
  //              which the straight line could never communicate;
  //   concerned  inner-end-up kink at browAngle > 10 — worry reads in the
  //              angle break, not just the lift.
  const bRaise = pose.browRaise * 5;
  const bAngle = pose.browAngle * D2R;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  const browSide = (dir: number): void => {
    const x0 = dir * (6 + eyeDX), x1 = dir * (20 + eyeDX);
    const y0 = -20 - bRaise - dir * Math.tan(bAngle) * 7;
    const y1 = -18 - bRaise + dir * Math.tan(bAngle) * 7 * -1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    if (surprise > 0.35) {
      ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 5.5 * surprise, x1, y1);
    } else if (concerned > 0.35) {
      const kx = x0 + (x1 - x0) * 0.34;
      ctx.lineTo(kx, y0 - 3.5 * concerned);
      ctx.lineTo(x1, y1);
    } else {
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  };
  browSide(-1);
  browSide(1);
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
  drawMouthV2(ctx, eyeDX, pose.smile, r.talk ?? 0);
  // cheek warmth — very subtle
  ctx.fillStyle = rgba(PALETTE.down, 0.16);
  ctx.beginPath(); ctx.ellipse(-21, 7, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(21, 7, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}
