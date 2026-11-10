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
  if (talk > 0.18) {
    // open, articulate mouth: rounded jaw with dark interior
    const w = 7 + talk * 4;
    const h = 2.5 + talk * 9;
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.ellipse(mx, 15, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    // small ivory tongue/teeth hint at the top of the opening (keeps it light)
    ctx.fillStyle = '#FDFCF8';
    ctx.beginPath();
    ctx.ellipse(mx, 15 - h * 0.45, w * 0.55, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (smile > 0.05) {
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-8 + mx, 14);
    ctx.quadraticCurveTo(mx, 14 + smile * 10, 8 + mx, 14);
    ctx.stroke();
  } else {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-6 + mx, 15);
    ctx.lineTo(6 + mx, 15);
    ctx.stroke();
  }
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

/** Two-bone tapered limb ending in a hand disc. Returns the hand position. */
export function limb2(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  aUpper: number, aLower: number,
  lenU: number, lenL: number,
  w0: number, wJ: number, w1: number,
  col: string
): { ex: number; ey: number } {
  const mx = x + Math.sin(aUpper * D2R) * lenU;
  const my = y + Math.cos(aUpper * D2R) * lenU;
  const ex = mx + Math.sin(aLower * D2R) * lenL;
  const ey = my + Math.cos(aLower * D2R) * lenL;
  taper(ctx, x, y, mx, my, w0, wJ, col);
  taper(ctx, mx, my, ex, ey, wJ, w1, col);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(ex, ey, w1 * 0.72, 0, Math.PI * 2);
  ctx.fill();
  return { ex, ey };
}

/**
 * PANEL-12 / P0-2 (report §12.2) — REAL HANDS on both arms.
 *
 * The v2 hand was a filled disc (a ball on a stick). Three short strokes
 * aligned to the forearm's angle — thumb + two fingers — read as a HAND at
 * any scale, including the 320px phone-feed test where the disc read as
 * noise. Drawn AFTER the limb so the fingers extend past the wrist joint.
 *
 * P1-7 (report §12.7): TAPERED 3-FINGER FAN + OPPOSED THUMB. The v12.2 glyph
 * was three EQUAL stubs at uniform width — a claw, not a hand; the report's
 * spec is a splayed fan (three fingers at different lengths and splay
 * angles) drawn with the rig's existing taper() (thick at the palm, thin at
 * the tip — mass where the finger joins, line where it ends), plus the
 * opposed thumb at a −66° offset: the ONE stroke that makes gestures
 * legible verbs (point, count, hold) at phone scale.
 */
function handGlyph(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,          // hand position from limb2()
  forearmAngle: number,          // the pose's lower-arm angle, degrees
  s: number, col: string         // s ≈ 13 at scale 1, grows with rig scale
): void {
  const a = forearmAngle * D2R;
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
  skewX = 0
): void {
  ctx.save();
  ctx.translate(cx, groundY);
  ctx.scale(scale, scale);
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
  },
  seed = 0
): void {
  const pose = r.pose;
  const alpha = r.alpha ?? 1;
  if (alpha <= 0.001) return;
  // P2-1: foreground parallax — the figure translates at 1.25× the camera
  // drift (the stage already rides the camera's 1.0×). ≤6px of differential
  // motion; unmistakable in motion, invisible in a still — which is exactly
  // what a depth cue is.
  let cx = cx0;
  let groundY = groundY0;
  if (r.parallax) {
    cx += camState.dx * 0.25;
    groundY += camState.dy * 0.25;
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
  ctx.scale(r.flip ? -scale : scale, scale);
  // v6 idle life: a 2.4s breath sway (±0.23°) around the ground contact —
  // the freeze between sentences read as a mannequin without it.
  ctx.rotate(Math.sin(t / 2400 + seed * 1.7) * 0.004);
  // v10 (panel CHAR-2): WEIGHT SHIFT — a slow 4.6s hip settle (±1.8px) plus
  // a 6.2s counter-lean. The breath sway alone still read "held mannequin"
  // between gestures: real presenters shift weight. Sub-pixel at phone
  // scale, unmistakable in motion. Deterministic in t, scrub-safe.
  const weight = Math.sin(t / 4600 + seed * 2.3) * 1.8;
  ctx.translate(weight, 0);
  ctx.rotate(Math.sin(t / 6200 + seed * 0.9) * 0.003);

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
  if ((r.shadow ?? 1) > 0) groundShadowV2(ctx, 0, 0, 1, r.shadowSkew ?? 0);

  const ink = PALETTE.ink;

  // PANEL-12 / P0-1 (report §12.1) — KILL THE GRAY-LIMB AMBIGUITY.
  // Far limbs used a different HUE (#67746F slate) — the panel read them
  // as "a gray duplicate drawn behind the figure", the #1 finding of the
  // whole audit. Depth now comes from the SAME ink at 0.62 alpha: the eye
  // reads transparency as atmosphere, not as a second character.
  // P0-2: the far hand gets the same 3-stroke glyph (drawn inside the
  // alpha block so it steps with its arm).
  ctx.save();
  ctx.globalAlpha = alpha * 0.62;
  const farFoot = limb2(ctx, -6, pelvisY, pose.lLU, pose.lLL, U_LEG, L_LEG, 12, 10, 9, ink);
  const farHand = limb2(ctx, neckX - 4, neckY + 3, pose.lAU, pose.lAL, U_ARM, L_ARM, 9, 8, 7, ink);
  handGlyph(ctx, farHand.ex, farHand.ey, pose.lAL, 10, ink);
  ctx.restore();

  // NEAR leg (support) — P0-3: both feet now get a shoe, slightly
  // oversized and forward-set. The far foot used to get NOTHING: at
  // phone scale a one-shoed figure reads as an error, and the panel
  // called the oversized forward shoe "an instant silhouette hook from
  // the ankles down".
  const nearFoot = limb2(ctx, 6, pelvisY, pose.rLU, pose.rLL, U_LEG, L_LEG, 15, 12, 10, ink);
  for (const f of [farFoot, nearFoot]) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(f.ex + 11, f.ey - 3, 18, 8.5, 0, 0, Math.PI * 2); // was 17,8 on near only
    ctx.fill();
  }

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
  taper(ctx, 0, pelvisY + 4, neckX, neckY, 15, 22, ink);

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
    ctx.ellipse(neckX, neckY + 4, 13, 8, leanR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // v10 (panel CHAR-3): a goldDeep outline on the knot — at side-host
    // scale the solid knot read as "a stain"; the two-tone knot reads as
    // a tied scarf at any size.
    ctx.strokeStyle = PALETTE.goldDeep;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(neckX, neckY + 4, 13, 8, leanR * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    // the ribbon — width, S-curve, two-tone underside (was 2 stroked lines)
    scarfTail(ctx, neckX - 3, neckY + 8, wave, PALETTE.gold, '#A8851B');
  }

  // NEAR arm — capture the hand so props ride it (v5, audit P1-3)
  const hand = limb2(ctx, neckX + 4, neckY + 3, pose.rAU, pose.rAL, U_ARM, L_ARM, 13, 11, 9, ink);
  // P0-2: the real hand glyph on the near arm
  handGlyph(ctx, hand.ex, hand.ey, pose.rAL, 13, ink);
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
  // v6: deterministic blink — 120ms every ~4.2s, phase-shifted per seed so
  // two hosts never blink in unison. A blink is 90% of "alive".
  const blink = ((t + seed * 700) % 4200) < 120 ? 0.12 : 1;
  // PANEL-12 / P0-5 (report §12.5) — TWO-STATE EYES. Above browRaise 0.6
  // (surprise / aha / shock) the dot eyes open into 6.2px white sclera
  // with 3.4px ink pupils: the cheapest face upgrade that survives phone
  // scale. Below the threshold the dots stay (calm register).
  if (pose.browRaise > 0.6) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, 6.2, 6.2 * blink, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, 6.2, 6.2 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, 3.4, 3.4 * blink, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, 3.4, 3.4 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(-11 + eyeDX, -6, 4.6, 4.6 * blink, 0, 0, Math.PI * 2);
    ctx.ellipse(11 + eyeDX, -6, 4.6, 4.6 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(-9.5 + eyeDX, -7.5, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(12.5 + eyeDX, -7.5, 1.6, 0, Math.PI * 2); ctx.fill();
  // brows (existing semantics)
  // P0-5: lineWidth 4→5.5, length +18% (±20/±6 was ±17/±5) — the panel
  // found the brows carry 80% of current expression; they now carry it
  // visibly, at phone scale too.
  const bRaise = pose.browRaise * 5;
  const bAngle = pose.browAngle * D2R;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-20 + eyeDX, -18 - bRaise + Math.tan(bAngle) * -7);
  ctx.lineTo(-6 + eyeDX, -20 - bRaise + Math.tan(bAngle) * 7);
  ctx.moveTo(6 + eyeDX, -20 - bRaise + Math.tan(-bAngle) * -7);
  ctx.lineTo(20 + eyeDX, -18 - bRaise + Math.tan(-bAngle) * 7);
  ctx.stroke();
  // mouth (v3: articulate talk envelope when speaking, panel P0-4)
  drawMouthV2(ctx, eyeDX, pose.smile, r.talk ?? 0);
  // cheek warmth — very subtle
  ctx.fillStyle = rgba(PALETTE.down, 0.16);
  ctx.beginPath(); ctx.ellipse(-21, 7, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(21, 7, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}
