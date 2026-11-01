/**
 * The Host — a premium stick man presenter.
 * Skeletal rig (pelvis → spine → head, two 2-segment arms, two 2-segment legs),
 * pose blending, deterministic gestures (safe for frame scrubbing), walk cycles,
 * breathing, blinking, brow expressions, and a signature gold scarf.
 */

import { clamp01, easeInOutSine, easeOutCubic, hash01, lerp, mix } from './easing';
import { PALETTE, rgba } from './theme';

const D2R = Math.PI / 180;

export interface Pose {
  rootY: number;      // vertical offset of pelvis (bob)
  lean: number;       // torso lean, degrees (positive → screen right)
  headTilt: number;  // extra head tilt, degrees
  lAU: number; lAL: number;  // left arm upper/lower angles, deg
  rAU: number; rAL: number;
  lLU: number; lLL: number;  // left leg upper/lower
  rLU: number; rLL: number;
  browRaise: number; // 0..1
  browAngle: number; // deg, positive = concerned inner-up
  smile: number;     // 0..1
}

const base = (): Pose => ({
  rootY: 0, lean: 0, headTilt: 0,
  lAU: -7, lAL: -4, rAU: 7, rAL: 4,
  lLU: -4, lLL: 0, rLU: 4, rLL: 0,
  browRaise: 0, browAngle: 0, smile: 0,
});

export const POSES: Record<string, Pose> = {
  idle: base(),
  talkA: { ...base(), lAU: -22, lAL: -34, rAU: 24, rAL: 30, smile: 0.3 },
  talkB: { ...base(), rAU: 30, rAL: 66, lAU: -10, lAL: -8, smile: 0.25 },
  talkC: { ...base(), lAU: -50, lAL: -66, rAU: 52, rAL: 64, smile: 0.3 },
  pointR: { ...base(), rAU: 78, rAL: 96, lAU: -8, lAL: -6, headTilt: -3 },
  pointL: { ...base(), lAU: -78, lAL: -96, rAU: 8, rAL: 6, headTilt: 3 },
  present: { ...base(), lAU: -52, lAL: -78, rAU: 54, rAL: 76, smile: 0.5 },
  think: { ...base(), rAU: 14, rAL: 150, lAU: -14, lAL: -10, headTilt: 5, browRaise: 0.35 },
  shrug: { ...base(), lAU: -66, lAL: -132, rAU: 68, rAL: 128, headTilt: 6, browRaise: 0.6, smile: 0.15 },
  wave: { ...base(), rAU: 104, rAL: 152, lAU: -8, lAL: -6, smile: 0.7, browRaise: 0.4 },
  count1: { ...base(), lAU: -96, lAL: -110, rAU: 10, rAL: 8, headTilt: -2 },
  count2: { ...base(), lAU: -96, lAL: -110, rAU: 104, rAL: 120, headTilt: -2 },
  count3: { ...base(), lAU: -96, lAL: -110, rAU: 104, rAL: 120, headTilt: -2, smile: 0.4 },
  climb: { ...base(), lAU: -128, lAL: -150, rAU: 132, rAL: 154, lLU: -22, lLL: -52, rLU: 24, rLL: 54, lean: 10, browRaise: 0.3, smile: 0.3 },
  serious: { ...base(), lAU: -14, lAL: -12, rAU: 16, rAL: 12, browAngle: 14, smile: 0 },
  aha: { ...base(), rAU: 96, rAL: 140, lAU: -40, lAL: -60, browRaise: 0.8, smile: 0.6 },
  close: { ...base(), lAU: -30, lAL: -46, rAU: 34, rAL: 48, smile: 0.55, browRaise: 0.15 },
};

export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  (Object.keys(a) as (keyof Pose)[]).forEach((k) => {
    o[k] = lerp(a[k], b[k], t);
  });
  return o;
}

// ── Rig geometry ─────────────────────────────────────────────────────────────
const RIG = {
  torso: 96, neck: 10, headR: 33,
  upperArm: 58, lowerArm: 54,
  upperLeg: 72, lowerLeg: 66,
  lineWidth: 11,
};

interface DrawOpts {
  /** 0..1 opacity */
  alpha?: number;
  /** horizontal flip (facing left) */
  flip?: boolean;
  /** pupil look direction -1..1 */
  look?: number;
  /** arm accent motion amplitude 0..1 (speaking energy) */
  energy?: number;
  /** gold scarf on/off */
  scarf?: boolean;
  /** ground shadow strength 0..1 */
  shadow?: number;
}

export class Stickman {
  /** deterministic time-based pose evaluation */
  static poseAt(t: number, opts: {
    gesture: string;
    speaking: boolean;
    seed?: number;
  }): Pose {
    const seed = opts.seed ?? 0;
    const gesture = opts.gesture || 'idle';
    let pose: Pose;
    if (opts.speaking && (gesture === 'present' || gesture === 'idle' || gesture === 'close')) {
      // gentle talk cycle among three open poses
      const cyc = ['talkA', 'talkB', 'talkC'];
      const idx = Math.floor(t / 2900 + seed) % cyc.length;
      const nextIdx = (idx + 1) % cyc.length;
      const ph = (t / 2900 + seed) % 1;
      const w = ph > 0.88 ? easeInOutSine(clamp01((ph - 0.88) / 0.12)) : 0;
      pose = blendPose(POSES[cyc[idx]], POSES[cyc[nextIdx]], w);
    } else if (opts.speaking && gesture === 'pointR') {
      pose = POSES.pointR;
    } else if (opts.speaking && gesture === 'pointL') {
      pose = POSES.pointL;
    } else if (opts.speaking && gesture === 'think') {
      pose = POSES.think;
    } else {
      pose = POSES[gesture] ?? POSES.idle;
    }
    // organic life: sway + breathing (deterministic)
    const sway = Math.sin(t / 1900 + seed * 7.3) * 2.2;
    const breathe = Math.sin(t / 2400 + seed * 3.1) * 2.4;
    const jitter = opts.speaking ? Math.sin(t / 610 + seed) * 1.1 : 0;
    return {
      ...pose,
      lean: pose.lean + sway * 0.4,
      rootY: pose.rootY + breathe + (opts.speaking ? jitter : 0),
      headTilt: pose.headTilt + sway * 0.25,
    };
  }

  /** walk-cycle pose: phase 0..1 one full stride pair */
  static walkPose(phase: number, speed = 1): Pose {
    const s = Math.sin(phase * Math.PI * 2);
    const c = Math.cos(phase * Math.PI * 2);
    const swing = 26 * speed;
    const bob = Math.abs(Math.sin(phase * Math.PI * 4)) * -5;
    return {
      ...base(),
      rootY: bob,
      lean: 4 + s * 2,
      lLU: -s * swing - 3, lLL: -Math.max(0, -s) * 18 * speed,
      rLU: s * swing + 3, rLL: Math.max(0, s) * 18 * speed,
      lAU: s * swing * 0.55 - 6, lAL: s * swing * 0.3 - 4,
      rAU: -s * swing * 0.55 + 6, rAL: -s * swing * 0.3 + 4,
      smile: 0.35,
      browRaise: 0.1,
      _unused: c,
    } as Pose;
  }

  static blinkScale(t: number, seed: number): number {
    // blinks every ~3.4s, 140ms long — deterministic
    const cycle = 3400 + Math.floor(hash01(seed + 1) * 1200);
    const ph = (t % cycle) / cycle;
    if (ph > 0.96) {
      const b = (ph - 0.96) / 0.04;
      return Math.max(0.06, 1 - Math.sin(b * Math.PI) * 1.05);
    }
    return 1;
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────
function limb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  aUpper: number,
  aLower: number,
  lenU: number,
  lenL: number,
  width: number,
  color: string
): { ex: number; ey: number; hx: number; hy: number } {
  const ux = x + Math.sin(aUpper * D2R) * lenU;
  const uy = y + Math.cos(aUpper * D2R) * lenU;
  const hx = ux + Math.sin(aLower * D2R) * lenL;
  const hy = uy + Math.cos(aLower * D2R) * lenL;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ux, uy);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  return { ex: ux, ey: uy, hx, hy };
}

export interface StickmanRender {
  pose: Pose;
  alpha?: number;
  flip?: boolean;
  look?: number;
  shadow?: number;
  scarf?: boolean;
  /** small nod pulse 0..1 (fires on key words) */
  nod?: number;
}

export function drawStickman(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  scale: number,
  t: number,
  r: StickmanRender,
  seed = 0
): void {
  const pose = r.pose;
  const alpha = r.alpha ?? 1;
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, groundY);
  ctx.scale(r.flip ? -scale : scale, scale);

  const pelvisY = -RIG.upperLeg - RIG.lowerLeg + pose.rootY; // pelvis above ground
  const leanR = pose.lean * D2R;
  const neckX = Math.sin(leanR) * RIG.torso;
  const neckY = pelvisY - Math.cos(leanR) * RIG.torso;
  const hipLX = -6, hipRX = 6;

  // ground shadow
  if ((r.shadow ?? 1) > 0) {
    ctx.fillStyle = rgba('#8C8474', 0.16 * (r.shadow ?? 1));
    ctx.beginPath();
    ctx.ellipse(0, 6, 58, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const ink = PALETTE.ink;
  const inkFar = '#5B5B66';
  const w = RIG.lineWidth;

  // far limbs (left side) in lighter ink → subtle depth
  limb(ctx, hipLX, pelvisY, pose.lLU, pose.lLL, RIG.upperLeg, RIG.lowerLeg, w * 0.92, inkFar);
  const shoulderLX = neckX - 4, shoulderLY = neckY + 3;
  limb(ctx, shoulderLX, shoulderLY, pose.lAU, pose.lAL, RIG.upperArm, RIG.lowerArm, w * 0.9, inkFar);

  // near limbs + torso
  limb(ctx, hipRX, pelvisY, pose.rLU, pose.rLL, RIG.upperLeg, RIG.lowerLeg, w, ink);
  ctx.strokeStyle = ink;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, pelvisY + 4);
  ctx.lineTo(neckX, neckY);
  ctx.stroke();

  // gold scarf (brand accent) at neck
  if (r.scarf !== false) {
    ctx.save();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.ellipse(neckX, neckY + 2, 11, 7, leanR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(neckX - 2, neckY + 4);
    ctx.quadraticCurveTo(
      neckX - 14 + Math.sin(t / 700 + seed) * 2,
      neckY + 26,
      neckX - 8 + Math.sin(t / 900 + seed) * 3,
      neckY + 44
    );
    ctx.stroke();
    ctx.restore();
  }

  // near arm
  const shoulderRX = neckX + 4, shoulderRY = neckY + 3;
  limb(ctx, shoulderRX, shoulderRY, pose.rAU, pose.rAL, RIG.upperArm, RIG.lowerArm, w, ink);

  // head (filled with bg color to occlude) + face
  const tiltR = (pose.lean + pose.headTilt) * D2R;
  const headCX = neckX + Math.sin(tiltR) * (RIG.neck + RIG.headR * 0.9);
  const headCY = neckY - Math.cos(tiltR) * (RIG.neck + RIG.headR * 0.9);
  const nod = (r.nod ?? 0) * 4;
  ctx.save();
  ctx.translate(headCX, headCY + nod);
  ctx.rotate(tiltR * 0.6);
  ctx.fillStyle = PALETTE.bgTop;
  ctx.strokeStyle = ink;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(0, 0, RIG.headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // eyes (with blink + look)
  const look = clamp01((r.look ?? 0) * 0.5 + 0.5) * 2 - 1;
  const blink = Stickman.blinkScale(t, seed);
  const eyeDX = look * 7;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(-11 + eyeDX, -6, 4.6, 4.6 * blink, 0, 0, Math.PI * 2);
  ctx.ellipse(11 + eyeDX, -6, 4.6, 4.6 * blink, 0, 0, Math.PI * 2);
  ctx.fill();

  // brows
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

  // mouth
  const smile = pose.smile;
  if (smile > 0.05) {
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = ink;
    ctx.moveTo(-8 + eyeDX * 0.6, 14);
    ctx.quadraticCurveTo(0 + eyeDX * 0.6, 14 + smile * 10, 8 + eyeDX * 0.6, 14);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = ink;
    ctx.moveTo(-6 + eyeDX * 0.6, 15);
    ctx.lineTo(6 + eyeDX * 0.6, 15);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/** Walking host: returns x position and walk pose for a walk-in entrance. */
export function walkIn(
  t: number,
  from: number,
  to: number,
  dur: number
): { x: number; pose: Pose; walking: boolean; phase: number } {
  const p = dur > 0 ? clamp01(t / dur) : 1;
  const ease = easeOutCubic(p);
  const x = lerp(from, to, ease);
  const walking = p < 0.98;
  const speed = 1.15;
  const phase = (t / 420) % 1;
  const pose = walking ? Stickman.walkPose(phase, speed) : Stickman.poseAt(t - dur, { gesture: 'idle', speaking: false });
  return { x, pose, walking, phase };
}

/** Entrance helper used by host scenes: fade+rise. */
export function riseIn(t: number, dur = 600): number {
  return easeOutCubic(clamp01(t / dur));
}

export function nodPulse(t: number, wordTimes: number[]): number {
  // small head nod that decays after each word accent
  let p = 0;
  for (const wt of wordTimes) {
    if (t >= wt && t < wt + 300) {
      p = Math.max(p, Math.sin(((t - wt) / 300) * Math.PI));
    }
    if (wt > t + 300) break;
  }
  return p;
}

export const mixPose = blendPose;
export const easeVal = easeOutCubic;
export const softMix = mix;
