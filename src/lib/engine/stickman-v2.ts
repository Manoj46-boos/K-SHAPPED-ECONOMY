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
import { clamp01 } from './easing';

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
 * v2 ground shadow — layered radial (contact core + ambient ring) + a short
 * gold "stage" line. Replaces the single flat ellipse.
 */
export function groundShadowV2(
  ctx: CanvasRenderingContext2D,
  cx: number, groundY: number, scale: number
): void {
  ctx.save();
  ctx.translate(cx, groundY);
  ctx.scale(scale, scale);
  const g = ctx.createRadialGradient(0, 4, 8, 0, 4, 120);
  g.addColorStop(0, rgba('#8C8474', 0.30));
  g.addColorStop(0.55, rgba('#8C8474', 0.12));
  g.addColorStop(1, rgba('#8C8474', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 8, 118, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba('#8C8474', 0.35);
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
  cx: number,
  groundY: number,
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
    /** Hand prop (v5, audit P1-3): 'coffee' — the second character's mug;
     * 'thumb' — a thumb stub on the raised fist for the thumbsUp pose. */
    prop?: 'coffee' | 'thumb';
  },
  seed = 0
): void {
  const pose = r.pose;
  const alpha = r.alpha ?? 1;
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, groundY);
  ctx.scale(r.flip ? -scale : scale, scale);

  const U_LEG = 72, L_LEG = 66, TORSO = 96, U_ARM = 58, L_ARM = 54;
  const pelvisY = -U_LEG - L_LEG + pose.rootY;
  const leanR = pose.lean * D2R;
  const neckX = Math.sin(leanR) * TORSO;
  const neckY = pelvisY - Math.cos(leanR) * TORSO;

  // ground (v2 layered shadow)
  if ((r.shadow ?? 1) > 0) groundShadowV2(ctx, 0, 0, 1);

  const ink = PALETTE.ink;
  const inkFar = '#6E6E78';

  // FAR limbs — thinner + lighter (depth)
  limb2(ctx, -6, pelvisY, pose.lLU, pose.lLL, U_LEG, L_LEG, 12, 10, 9, inkFar);
  limb2(ctx, neckX - 4, neckY + 3, pose.lAU, pose.lAL, U_ARM, L_ARM, 9, 8, 7, inkFar);

  // NEAR leg (support) + foot
  const foot = limb2(ctx, 6, pelvisY, pose.rLU, pose.rLL, U_LEG, L_LEG, 15, 12, 10, ink);
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(foot.ex + 10, foot.ey - 3, 17, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // torso — tapered spine (wider at shoulders = grounded anatomy)
  taper(ctx, 0, pelvisY + 4, neckX, neckY, 17, 20, ink);

  // gold scarf (brand) — knot + two waving tails
  if (r.scarf !== false) {
    const wave = Math.sin(t / 700 + seed) * 6;
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.ellipse(neckX, neckY + 4, 13, 8, leanR * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.goldDeep;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(neckX - 3, neckY + 8);
    ctx.quadraticCurveTo(neckX - 26 + wave * 0.4, neckY + 40, neckX - 12 + wave, neckY + 78);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(neckX + 2, neckY + 9);
    ctx.quadraticCurveTo(neckX - 10 - wave * 0.3, neckY + 34, neckX + 6 - wave * 0.6, neckY + 58);
    ctx.stroke();
  }

  // NEAR arm — capture the hand so props ride it (v5, audit P1-3)
  const hand = limb2(ctx, neckX + 4, neckY + 3, pose.rAU, pose.rAL, U_ARM, L_ARM, 13, 11, 9, ink);
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
    ctx.strokeStyle = rgba('#8C8474', 0.55);
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
  ctx.save();
  ctx.translate(headCX, headCY + nod);
  ctx.rotate(tiltR * 0.6);
  // soft head shadow for depth
  ctx.fillStyle = rgba('#8C8474', 0.10);
  ctx.beginPath();
  ctx.arc(3, 5, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.bgTop;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // eyes + glints
  const look = clamp01((r.look ?? 0) * 0.5 + 0.5) * 2 - 1;
  const eyeDX = look * 7;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(-11 + eyeDX, -6, 4.6, 4.6, 0, 0, Math.PI * 2);
  ctx.ellipse(11 + eyeDX, -6, 4.6, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(-9.5 + eyeDX, -7.5, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(12.5 + eyeDX, -7.5, 1.6, 0, Math.PI * 2); ctx.fill();
  // brows (existing semantics)
  const bRaise = pose.browRaise * 5;
  const bAngle = pose.browAngle * D2R;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-17 + eyeDX, -18 - bRaise + Math.tan(bAngle) * -6);
  ctx.lineTo(-5 + eyeDX, -20 - bRaise + Math.tan(bAngle) * 6);
  ctx.moveTo(5 + eyeDX, -20 - bRaise + Math.tan(-bAngle) * -6);
  ctx.lineTo(17 + eyeDX, -18 - bRaise + Math.tan(-bAngle) * 6);
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
