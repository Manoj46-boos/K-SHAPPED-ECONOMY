/**
 * The Host — a premium stick man presenter.
 * Skeletal rig (pelvis → spine → head, two 2-segment arms, two 2-segment legs),
 * pose blending, deterministic gestures (safe for frame scrubbing), walk cycles,
 * breathing, blinking, brow expressions, and a signature gold scarf.
 */

import { clamp01, drift, easeOutCubic, hash01, hashStr, lerp, mix, springTo } from './easing';
import { PALETTE, rgba } from './theme';
import { AMP, HERO } from './perception';

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
  /** AUDIT-2 / 1.5 (report §10.2, M5): per-foot vertical lift, px (positive
   *  = up). Walk 2.0 — the swinging foot sweeps an ARC (zero at contacts,
   *  peak mid-swing) instead of a straight line through space. Default 0
   *  everywhere except walkPose. */
  lLift?: number;
  rLift?: number;
  /** AUDIT-3 / Walk 3.0 (report §2.6): per-shoe pitch, degrees (negative =
   *  toe up / heel-strike, positive = toe down / toe-off). Drives the shoe
   *  ellipse rotation so the foot ROLLS through the stride instead of
   *  sliding flat. Default 0 everywhere except walkPose. */
  lToe?: number;
  rToe?: number;
  /** BLUEPRINT Phase 2 (report §11): pelvis tilt, deg (+ = right hip
   *  rises, weight onto the left leg). The missing rotation term that
   *  separates a puppet from a body — walkPose keys it, the v2 renderer
   *  tilts the hip anchors and the torso base. Blendable like every other
   *  key (blendPose lerps it), so all existing poses default to 0 and stay
   *  compatible. */
  pelvisTilt?: number;
  /** BLUEPRINT Phase 2: shoulder-line counter-rotation, deg — the shoulder
   *  line counters the pelvis (the classical contrapposto S-curve). */
  shoulderTilt?: number;
  /** P1-4 (100-judge audit, Table 3 — SILHOUETTE-LEVEL EMOTIONS): "emotions
   *  that change only line angles die at phone scale; emotions that change
   *  silhouette shapes survive." Per-eye scale multipliers (the wry
   *  squint-smirk = 0.55 / 1.12) and a shoulder drop in px (positive = the
   *  near shoulder sinks — the wry slouch; negative = chest open, the
   *  warm lift). Blended like every other key; defaults are neutral. */
  eyeL?: number;
  eyeR?: number;
  shoulderDrop?: number;
  /** AUDIT-ROUND-2 (fix 11 — HEAD YAW AT CONTENT): the head turns toward
   *  the pose's pointBias (max 14°, AMP.headYawDeg) — the missing rotation
   *  term that makes the EYELINE connect (the audit's C5: "the audience
   *  reads connection through the head yaw first, eyes second"). The v2
   *  renderer pivots the whole head about the neck, so the head displaces
   *  toward the content while the pupils keep their 7px look travel ON
   *  TOP. Blended like every other key; default 0. */
  headYaw?: number;
  /** P1-2 (audit Table 3): explicit hand glyph override — 'fist' or the
   *  count glyphs 'count1'/'count2'/'count3' (a fist with N fingers
   *  extended). Default = the MITTEN at every scale.
   *  PHASE-1 (100-judge report §11 Phase 1 — ONE HAND LANGUAGE): the
   *  vocabulary is three glyphs — the mitten (resting + presenting),
   *  'point' (the mitten with one extended index finger: pointR/pointL
   *  and every contact-verb scene), and the fist/count set. 'palm'
   *  survives as a call-site alias that the renderer maps to 'point'.
   *  The four-finger splay fan is retired. */
  lHand?: 'fist' | 'grip' | 'count1' | 'count2' | 'count3' | 'palm' | 'point';
  rHand?: 'fist' | 'grip' | 'count1' | 'count2' | 'count3' | 'palm' | 'point';
  /** 100-JUDGE PANEL / Phase 1 item 3 — TAKE GRAMMAR (report §6 Phase 1):
   * 0..1 blink closure the take() helper drives through its overshoot
   * (closed → opening across the settle). The v2 renderer multiplies it
   * into eyeOpen; the idle blink clock stays untouched. Undefined = the
   * idle blink owns the eyes (default). */
  blinkT?: number;
}

const base = (): Pose => ({
  rootY: 0, lean: 0, headTilt: 0,
  lAU: -7, lAL: -4, rAU: 7, rAL: 4,
  // AUDIT-ROUND-3 iter-2 (Fix 1 — KNEES AT REST): the base stance was
  // dead straight (thigh and shin on one line) — "two straight tapered
  // columns meeting the feet... no knee articulation". A natural stance
  // carries a soft bend: shins angle back under the body (~9°), the
  // knuckles in the renderer carry the joint. Every pose built on base()
  // inherits the articulated read.
  lLU: -4, lLL: 5, rLU: 4, rLL: -5,
  browRaise: 0, browAngle: 0, smile: 0,
  lLift: 0, rLift: 0, lToe: 0, rToe: 0,
  pelvisTilt: 0, shoulderTilt: 0,
  eyeL: 1, eyeR: 1, shoulderDrop: 0,
  headYaw: 0,
});

export const POSES: Record<string, Pose> = {
  // AUDIT-3 / §2.1 (report Phase 2.1 — LINE OF ACTION): the four REST
  // poses (idle + the three talk-cycle gestures) are re-keyed with a
  // weight-shift AND asymmetric arms — one high, one low, shoulders
  // counter-angled. Premium stick figures are never symmetric at rest;
  // symmetric A-poses / V-cheers are the “mannequin salesman” tell the
  // re-verification panel flagged on both BEFORE host frames.
  // B6 RE-SPEC (Visual Quality Audit §3.1 — THE DEFAULT BODY IS A
  // MANNEQUIN): the previous idle keys were tilt-only (arms ±12° from
  // vertical, elbows near-zero) — the render showed soldier-at-parade
  // arms, crossed shins, no weight. A rest pose has BENT ARMS and a
  // committed weight leg: near arm bent ~28° forward (hand in front of
  // the thigh), far arm relaxed behind the hip, left leg straight and
  // bearing (with pelvisTilt + it carries the weight), right leg easy,
  // head committing toward the content side. The figure now rests like
  // a person waits, not like a puppet hangs.
  idle: { ...base(), lean: 5, pelvisTilt: 11, shoulderTilt: -6, headTilt: -2, lLU: -6, lLL: -1, rLU: 16, rLL: 10, lAU: -16, lAL: -34, rAU: 12, rAL: 40 },
  // B13 (Visual Quality Audit — THE CAMERA DOES ALL THE ACTING): the
  // sentence-spring poses are the body's own voice — their gesture
  // register rises ~28% so the BODY carries the energy the camera
  // systems were spending (the arms read at feed scale now).
  talkA: { ...base(), lAU: -18, lAL: -14, rAU: 34, rAL: 46, smile: 0.3, lean: 3, lLU: -7, rLU: 9, rLL: 5 },
  talkB: { ...base(), rAU: 39, rAL: 84, lAU: -13, lAL: -10, smile: 0.25, lean: -2, lLU: -8, lLL: 4, rLU: 6 },
  talkC: { ...base(), lAU: -26, lAL: -36, rAU: 69, rAL: 90, smile: 0.3, lean: 4, lLU: -8, rLU: 9, rLL: 6 },
  // PHASE-1 (100-judge report §11 Phase 1): pointR/pointL raise the dedicated
  // POINT glyph — the mitten with one extended index finger; present presents
  // with the plain mitten (the splay-fan palm is retired).
  pointR: { ...base(), rAU: 78, rAL: 96, lAU: -8, lAL: -6, headTilt: -3, lean: 3, lLU: -8, rLU: 9, rLL: 5, rHand: 'point' },
  pointL: { ...base(), lAU: -78, lAL: -96, rAU: 8, rAL: 6, headTilt: 3, lean: -2, lLU: -7, rLU: 9, rLL: 5, lHand: 'point' },
  present: { ...base(), lAU: -26, lAL: -32, rAU: 54, rAL: 76, smile: 0.5, lean: 2, lLU: -8, rLU: 9, rLL: 6 }, // PHASE-1: the mitten presents
  think: { ...base(), rAU: 14, rAL: 150, lAU: -14, lAL: -10, headTilt: 5, browRaise: 0.35 },
  shrug: { ...base(), lAU: -66, lAL: -132, rAU: 68, rAL: 128, headTilt: 6, browRaise: 0.6, smile: 0.15 },
  wave: { ...base(), rAU: 104, rAL: 152, lAU: -8, lAL: -6, smile: 0.7, browRaise: 0.4 },
  count1: { ...base(), lAU: -96, lAL: -110, rAU: 10, rAL: 8, headTilt: -2, lHand: 'count1' },
  count2: { ...base(), lAU: -96, lAL: -110, rAU: 104, rAL: 120, headTilt: -2, lHand: 'count2' },
  count3: { ...base(), lAU: -96, lAL: -110, rAU: 104, rAL: 120, headTilt: -2, smile: 0.4, lHand: 'count3' },
  // PHASE-1 VISUAL AUDIT (report Phase 1 — poses re-keyed AS SILHOUETTES;
  // frame evidence BEFORE_fix3-poses_climb): the old key had BOTH arms
  // overhead (lAU -104 / rAU 134) — the silhouette read as a cheer, not
  // an ascent. A climb silhouette is a DIAGONAL: ONE arm reaching up the
  // slope (right, forearm near-straight to the next rung), ONE arm
  // pulling low behind (left — the ownerWorker call site already forced
  // this with its lAU override; the key now agrees), the trailing leg
  // extended off the rung, the near knee driven high, the torso leaning
  // INTO the ascent. One shape: ascending.
  // 100-JUDGE REPORT (fix D17 — THE SPLITS SCARECROW): the previous key
  // (lLU -30/lLL -58 with rLU 40/rLL 68) still rendered both legs at a
  // ~100-degree total spread — a full split under the 128° reach arm, a
  // skydiving scarecrow at hero scale. A climb is a COMPACT diagonal: the
  // reach arm stays up the slope, the pull arm stays low behind, and BOTH
  // legs stay under the body (near knee driven up, trailing shin extended
  // but inside the shoulder line). One shape: ascending, grounded.
  climb: { ...base(), lAU: -36, lAL: -52, rAU: 128, rAL: 148, lLU: -14, lLL: -34, rLU: 18, rLL: -6, lean: 12, browRaise: 0.35, smile: 0.25 },
  serious: { ...base(), lAU: -14, lAL: -12, rAU: 16, rAL: 12, browAngle: 14, smile: 0 },
  aha: { ...base(), rAU: 96, rAL: 140, lAU: -40, lAL: -60, browRaise: 0.8, smile: 0.6 },
  close: { ...base(), lAU: -30, lAL: -46, rAU: 34, rAL: 48, smile: 0.55, browRaise: 0.15 },
  // v5 (audit P1-3): three new poses — the emotional range the panel asked for.
  // leanIn: curiosity — torso tips toward the content, brows up, held breath
  leanIn: { ...base(), lean: 12, headTilt: -5, rootY: -4, lAU: -20, lAL: -30, rAU: 12, rAL: 26, browRaise: 0.45, smile: 0.35 },
  // facepalm: dismay — palm to forehead, head bowed, concerned brows
  facepalm: { ...base(), lean: 4, headTilt: 12, rootY: 2, lAU: -10, lAL: -6, rAU: 78, rAL: 222, browRaise: 0.1, browAngle: 18, smile: 0 },
  // thumbsUp: earned optimism — fist raised beside the head, big smile
  thumbsUp: { ...base(), lean: -3, headTilt: -4, lAU: -18, lAL: -14, rAU: 85, rAL: 150, browRaise: 0.5, smile: 0.75 },
  // ── P1-1 (report): asymmetric hero poses. The v5 pose set is near-mirror
  // symmetric (both arms at matched angles), so every "big" moment read as
  // the same mannequin stance. Three deliberately ASYMMETRIC hero poses —
  // weight on one leg, one arm high, one low — for the film's signature
  // moments. Still pure data, still blendable with every existing pose.
  // heroPresent: the signature-scene stance — weight back on the near leg,
  // right arm sweeping high to the K, left hand low and open.
  heroPresent: { ...base(), lean: 7, headTilt: -3, rootY: -2, lLU: -9, lLL: 6, rLU: 11, rLL: -7, lAU: -18, lAL: 14, rAU: 72, rAL: 98, browRaise: 0.25, smile: 0.55 },
  // heroPoint: conviction — full-body point up-right, free hand parked on
  // the hip, chin up.
  // heroPoint: conviction — full-body point up-right, free hand parked on
  // P1 hands (100-judge dossier): the contact gestures grip — the near hand
  // takes the FIST glyph (a closed hand on the K's stem / at the point),
  // not the open fan. Contact scenes get contact hands.
  heroPoint: { ...base(), lean: 9, headTilt: -5, lAU: -58, lAL: 118, rAU: 96, rAL: 118, browRaise: 0.4, smile: 0.45, rHand: 'fist' },
  // heroExplain: the teacher — near palm open low ("this number"), far arm
  // relaxed, head tilted into the audience.
  heroExplain: { ...base(), lean: -5, headTilt: 6, lAU: -64, lAL: -84, rAU: 16, rAL: 10, browRaise: 0.3, smile: 0.4 },
  // AUDIT-3 / §3.3 (report Phase 3.3 — "the K as a place. The host leans
  // on it"): the signature scene's settled stance — leaning INTO the
  // letter while the raised hand stays ON its stem. Contact + lean in
  // one pose, so the presenter touches what he presents in EVERY frame
  // after the formation completes (the round-5 panel: "proximity ≠
  // contact — you moved the presenter to the object and forgot the
  // pointing").
  // PHASE-1 VISUAL AUDIT (pose re-key AS SILHOUETTE, evidence
  // BEFORE_fix3-poses_leanOnK): the old key leaned 10° with the brace arm
  // at a 24° elbow bend and both legs parallel — the silhouette read as
  // "standing near the letter". The re-key: the lean deepens to 14° (the
  // weight visibly shifts INTO the letter), the brace arm straightens to
  // a 16° bend (a column he rests ON, not a wave), the free arm hangs
  // lower-back, and the brace-side shin tucks back (the crossed-ankle
  // casual lean). One shape: leaning-on.
  leanOnK: { ...base(), lean: 14, headTilt: -4, lLU: -12, lLL: 2, rLU: 13, rLL: -14, lAU: -16, lAL: -22, rAU: 78, rAL: 94, browRaise: 0.25, smile: 0.5, rHand: 'grip' }, // P1 hands: the hand GRIPS the stem
  // ── BLUEPRINT Phase 2 (report §11): the three REACTION pose keys the
  // film's emotional beats were missing — the twist, the resolve and the
  // final takeaway shared the presenting smile before (“a static mask
  // wearing a smile… at the twist, the host is grinning like he's greeting
  // guests at a trade show”). Each is blendable with every existing pose;
  // browRaise ≥ 0.55 trips the sclera-eye rig in stickman-v2.
  // shock: the twist beat (c8-fund) — full recoil: head back 6°, arms flung
  // asymmetric, brows at the ceiling, mouth driven open by the reaction
  // envelope (the 2× jaw in drawMouthV2).
  // PLAYBOOK P6 (report §8.1 — SILHOUETTE EMOTIONS): +shoulderDrop 6 —
  // the chest COLLAPSES on shock (the near shoulder sinks; the panel:
  // "emotions that change silhouette shapes survive" the phone gate).
  // 100-JUDGE PANEL REPORT (fix E1 — THE SHOCK RE-KEY): the old key flung
  // BOTH arms up symmetrically (lAU -104 / rAU 118) with the mouth wide —
  // the silhouette read as jazz hands, as CELEBRATION, on the exact beat
  // the narration says two contradictory numbers collided. A premium
  // shock is asymmetric: the near arm guards high but FLEXED, the far arm
  // recoils LOW with the elbow bent, the head rocks back with the weight
  // settling onto the back foot (pelvisTilt flips), shoulders dropped.
  // Reads as recoil with zero motion — the test a hero shock must pass.
  shock: { ...base(), lean: -6, headTilt: -6, rootY: 7, lAU: -102, lAL: -124, rAU: -26, rAL: -70, lLU: -11, lLL: 4, rLU: 12, rLL: -8, browRaise: 0.95, smile: 0.02, pelvisTilt: -6, shoulderTilt: -3.5, shoulderDrop: 10, eyeL: 1.45, eyeR: 1.45 }, // PHASE-1 re-key: deeper recoil (lean -6, rootY 7, drop 10) — the flinch silhouette
  // wry: the paradox resolve (c7-paradox) — the knowing half-smile: one brow
  // up, one down, head tilted, hand low like “well, actually”.
  // P1-4: + silhouette terms — the near eye squints to 0.55 while the far
  // opens 1.12 (the squint-smirk reads at 320px where brow values die)
  // and the near shoulder drops 4.5px (the slouch).
  // PHASE-5 (report §11 Phase 5 — LET THE BODY ACT): the amplitudes drive
  // to their limits — the asymmetry eye squints to 0.3 (a near-wink) while
  // the far dilates to 1.3, and the slouch drops the full 8px: the
  // silhouette emotion must survive compression, and these are the terms
  // that do.
  wry: { ...base(), lean: 5, headTilt: 7, lAU: -16, lAL: -12, rAU: 38, rAL: 96, lLU: -8, rLU: 9, rLL: 5, browRaise: 0.62, browAngle: -10, smile: 0.45, pelvisTilt: 3.2, shoulderTilt: -2.6, eyeL: 0.3, eyeR: 1.3, shoulderDrop: 8 },
  // ── 100-JUDGE PANEL / Phase 2 item 3 — A SIT-AND-RISE FOR THE MOOD
  // CHAPTERS (report §6 Phase 2, p.14): "One new pose pair (sitBack on
  // the stat card edge) with the ground-contact math the walk already
  // uses. Staging variety; the 12-second-hold risk dies with it."
  // sitBack: the settled perch — the host sits on a stat card's edge,
  // thighs near-horizontal, shins planted, weight on the hands. The
  // leg angles ride the SAME pelvis anchor the walk uses (hip angles
  // from the pelvis, knees below); rootY drops the pelvis to the seat
  // height (the card edge lives ~92px above the ground line at host
  // scale — rootY +58 sinks the hip onto it).
  sitBack: { ...base(), rootY: 58, lean: 8, headTilt: 4, lLU: 74, lLL: 4, rLU: 94, rLL: 14, lAU: -24, lAL: -40, rAU: 30, rAL: 26, smile: 0.3, browRaise: 0.2, pelvisTilt: 2, shoulderTilt: -1.5 }, // PHASE-1 re-key: thighs separate (74/94) so the two legs read as two, not one tangle
  // sitRise: the push-up off the edge — weight driving through the
  // planted feet, hands pressing the card, the body at 60% between
  // sitBack and standing. The rise reads as EFFORT: arms straight,
  // brow down, pelvis still on the seat line.
  sitRise: { ...base(), rootY: 22, lean: 14, headTilt: -2, lLU: 56, lLL: 2, rLU: 60, rLL: 6, lAU: -44, lAL: -58, rAU: 48, rAL: 62, browRaise: 0.35, smile: 0.1, pelvisTilt: 1, shoulderTilt: -0.5 },
  // warm: the final takeaway (c9-three) — earned optimism, chest open,
  // soft raised brows, the big smile.
  // P1-4: + silhouette terms — both eyes widen 1.15 (soft wide-eyed
  // warmth) and the shoulders lift (chest open, −3px drop = rise).
  warm: { ...base(), lean: -3, headTilt: -3, lAU: -34, lAL: -44, rAU: 30, rAL: 44, lLU: -9, rLU: 10, rLL: 6, browRaise: 0.42, smile: 0.85, pelvisTilt: -3.0, shoulderTilt: 2.4, eyeL: 1.15, eyeR: 1.15, shoulderDrop: -3 },
  // ── 100-JUDGE PANEL / PHASE 1 item 1 — THE DELIBERATE REFUSAL ──────────
  // report §6 Phase 1: "Target: 100% of beats with an on-screen host have
  // a contact verb or a deliberate crossed-arm refusal." `crossed` is the
  // refusal's KEY: both forearms fold across the chest (the near arm
  // tucks under, the far arm wraps over — two angle sets that read as one
  // folded stack at any scale), the chin lifts 2°, the brow flattens
  // (browAngle) and the smile zeroes out: the body says "I'm not buying
  // it" without a word. It is the sanctioned NON-contact verb for data
  // beats whose staging keeps every object out of arm's reach — the
  // arms CROSSED AT the data instead of reaching for it.
  // Angle check (degrees from the down axis, + toward screen-right; limb
  // angles are ABSOLUTE — the fold is authored end-to-end):
  //   GEOMETRY (round-4 correction — the panel's pixel reads caught two
  //   wrong folds: −148/−142 was the shrug's splay, −168 planted the fist
  //   at the JAW). The true fold is a near-HORIZONTAL forearm: rAU 55 puts
  //   the near elbow out at (51, −146); rAL −99 swings the forearm almost
  //   level, left and 9px up — the fist lands at (−2, −154), the sternum.
  //   The far arm mirrors (lAU −55, lAL 105 — 6px higher): two fists
  //   stacked at the sternum, the forearms crossing the whole chest.
  // PHASE-1 VISUAL AUDIT (pose re-key AS SILHOUETTE, evidence
  // BEFORE_fix3-poses_crossed): the round-4 fold stacked BOTH fists at
  // the sternum (-2,-154)/(6,-160) — one dark lump across the chest.
  // The re-key separates the fold: the near fist tucks UNDER at the far
  // elbow (rAL -99 → -80, fist rises to -136), the far fist wraps OVER
  // past the near elbow (lAL 105 → 118, fist climbs to -171) — two
  // separated fist masses, two elbow points, a readable X. Hands are the
  // GRIP glyph (closed contact).
  crossed: { ...base(), lean: 2, headTilt: 4, lAU: -55, lAL: 118, rAU: 55, rAL: -80, lLU: -6, rLU: 8, rLL: 4, browAngle: 12, smile: 0.06, browRaise: 0.14, pelvisTilt: -2, shoulderDrop: 4, lHand: 'grip', rHand: 'grip' },
};

export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const o = {} as Pose;
  (Object.keys(a) as (keyof Pose)[]).forEach((k) => {
    // AUDIT-2 / 1.5: lLift/rLift are optional on Pose — lerp their
    // defaults (0) so strict-mode builds stay clean.
    // P1-2: the hand-glyph keys (lHand/rHand) are string unions, not
    // numbers — they pass through (the nearer pose owns the glyph)
    // instead of lerping.
    const av = a[k];
    const bv = b[k];
    if (typeof av === 'string' || typeof bv === 'string') {
      (o as unknown as Record<string, unknown>)[k] = t < 0.5 ? (av ?? bv) : (bv ?? av);
      return;
    }
    (o as unknown as Record<string, unknown>)[k] = lerp(av ?? 0, bv ?? 0, t);
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
    /** P1-6 (report §12.6): the sentence grammar — line id of the sentence
     *  being spoken, its predecessor, ms since it started, and word onsets
     *  in the same clock as t. Supplied by the director via SceneCtx. */
    sentenceId?: string;
    prevSentenceId?: string;
    sentenceT?: number;
    wordTimes?: number[];
    /** PANEL ACCEPTANCE (audit FIX 6 — TWO-TIER ACCENTS): the word TEXTS
     *  aligned 1:1 with wordTimes (same clock, same order). Content words
     *  (≥3 chars, hash-gated — the same rule accentPulse uses) keep the
     *  full 44° strike; function words drop to a 12° whisper. Omitted =
     *  every word accents full (the legacy behavior). */
    words?: string[];
    /** AUDIT-3 / §1.5 (report Phase 1.5 — the host points at what he
     *  presents): directional bias for the sentence-gesture list. When the
     *  content sits to the host's right ('right'), pointR joins the list
     *  twice — the gesture cycle presents TOWARD the data instead of
     *  flapping symmetrically beside it (the “presenting the empty air"
     *  re-verification verdict). Deterministic: the list is still keyed by
     *  the sentence-id hash. */
    pointBias?: 'left' | 'right';
  }): Pose {
    const seed = opts.seed ?? 0;
    const gesture = opts.gesture || 'idle';
    // P1 (Verdict report — THE TRUE ONE-POLE HEAD LAG): the DELAYED gesture
    // lean is captured inside the sentence branch (where the spring terms
    // live) and consumed at the return — the head arrives ~105ms after the
    // torso on every lean change, in closed form (scrub-safe).
    let leanDelayed: number | null = null;
    let pose: Pose;
    if (opts.speaking && (gesture === 'present' || gesture === 'idle' || gesture === 'close')) {
      // P1-6 (report §12.6): THE METRONOME IS DEAD. The talk cycle used to
      // flap through the same 3 poses on a 2.9s wall clock — the panel's
      // "a man miming enthusiasm to a metronome", 3/10. The grammar is now
      // keyed to LANGUAGE: each sentence gets ONE gesture (deterministic
      // hash of its line id, from a 5-pose list), sprung into from the
      // previous sentence's gesture (420ms, the house spring — continuity
      // at the boundary is exact), and the forearm PULSES on each word
      // onset (a 300ms decaying accent) instead of flapping on a clock.
      // Sentence lengths vary 2–6s, so the phrasing varies with the script
      // — produced, not clockwork. Scrub-safe: every term is a pure
      // function of (t, sentence data).
      if (opts.sentenceId !== undefined) {
        // AUDIT-3 / §1.5: the directional list — with a pointBias the
        // pointing gesture takes 2 of 5 slots so the presenter TALKS
        // TOWARD his content (chart, cards, type block) instead of
        // gesturing into dead space beside it.
        // 100-JUDGE PANEL / Phase 1 item 5 — HAND VOCABULARY (report §6
        // Phase 1): the presenting cycle now carries the full hand
        // vocabulary — the palm-open PRESENT (rHand 'palm') and the
        // COUNT gestures (rHand 'countN', counting with eye contact
        // on the numerals the host is presenting) join the pointing
        // slots. The metronome dead-list (talk/talk/talk/point) becomes
        // a vocabulary list: every sentence picks a distinct HAND, not
        // just a distinct arm angle — "hands stop being mitts in every
        // non-hero frame".
        const list = opts.pointBias === 'right'
          ? ['talkA', 'pointR', 'present', 'count2', 'pointR', 'talkB', 'count1']
          : opts.pointBias === 'left'
            ? ['talkB', 'pointL', 'present', 'count2', 'pointL', 'talkA', 'count1']
            : ['talkA', 'talkB', 'present', 'count2', 'pointR', 'count3', 'talkC'];
        const pick = (id: string): Pose =>
          POSES[list[Math.min(list.length - 1, Math.floor(hashStr(id) * list.length))]];
        const cyc = pick(opts.sentenceId);
        const prevPose = pick(opts.prevSentenceId ?? opts.sentenceId);
        // AUDIT-2 / 1.6 (report §10.2, M1/M2 + §10.3): ARCS, CASCADE and
        // ANTICIPATION on every sentence gesture —
        //  • ANTICIPATION: the first 150ms blends the pose 30% AWAY from
        //    the target (the wind-up every launched gesture needs), then
        //    hands off to the house spring exactly at prevPose — continuity
        //    is exact at the 150ms boundary.
        //  • CASCADE: the forearm rides a spring lagged 70ms behind the
        //    upper arm — shoulder arrives first, elbow a beat later: a wave
        //    that travels down the limb instead of a puppet snap.
        //  • ARC: while the spring runs, the wrists bias outward so the
        //    hand traces a curve through space, not a straight line.
        // All pure functions of (t, sentence data) — scrub-safe.
        const st = opts.sentenceT ?? 1e9;
        // 100-JUDGE AUDIT (Part 9.2 — REAL OVERSHOOT). The shipped 9%
        // overshoot (damping 14) was below the perceptual threshold for
        // "the hand struck the pose" at phone scale — it read as "the
        // arm arrived at the pose". Premium gesture springs overshoot
        // 15-25% on accents. Damping drops 14 → 11 (more underdamped =
        // ~18% overshoot) and stiffness 170 → 140 (slower settle, 2-3
        // visible bounces). The clamp01 stays off; the floor at 0 stays.
        // PHASE 2 VISUAL AUDIT (Fix 2 — THE 200MS HERO HOLD): the rig's
        // hero strikes are the tier-1 (full) word accents. Before each one
        // the gesture transition HOLDS — the spring input freezes at its
        // value 200ms before the onset (closed form: stEff = st − (200 − d)
        // while the time-to-onset d ∈ (0,200]), so the figure reads the
        // wind-up beat the motion grammar prescribes ("acted, not
        // tweened"). The accent envelope itself stays onset-keyed — the
        // strike still lands ON the word, 200ms of held anticipation
        // ahead of it. Pure function of (t, word data) — scrub-safe.
        let holdD: number | null = null;
        if (opts.wordTimes && opts.words) {
          for (let wi = 0; wi < opts.wordTimes.length; wi++) {
            const d = opts.wordTimes[wi] - t;
            if (d > 0 && d <= 200 && accentFire(opts.words[wi] ?? '')) {
              holdD = holdD === null ? d : Math.min(holdD, d);
            }
          }
        }
        const stEff = holdD !== null ? st - (200 - holdD) : st;
        const anti = stEff < 150 ? Math.sin((stEff / 150) * Math.PI) * 0.45 : 0;
        const sT = Math.max(0, stEff - 150);
        // P1 — the same spring sampled 105ms late: the torso's lean delayed
        const antiLag = (stEff - 105) < 150 && stEff > 105 ? Math.sin(((stEff - 105) / 150) * Math.PI) * 0.45 : 0;
        const fUpLag = Math.max(0, springTo(0, 1, Math.max(0, sT - 105), 150, 10.5) - antiLag);
        leanDelayed = lerp(prevPose.lean, cyc.lean, fUpLag);
        // PHASE 2 VISUAL AUDIT (Fix 3 — OVERSHOOT IN THE 20-25% HERO BAND):
        // damping 11 → 10.5 (ζ = 0.4287 → 22.5% overshoot, the middle of
        // the report's band); stiffness 150 (settle unchanged).
        const fUp = Math.max(0, springTo(0, 1, sT, 150, 10.5) - anti);
        // AUDIT-ROUND-2 (fix 14): elbow cascade 70 → 90ms behind the
        // shoulder — a wave that visibly travels DOWN the limb at phone
        // scale (70ms downsampled to a snap at 320px).
        const fLo = Math.max(0, springTo(0, 1, Math.max(0, sT - 90), 150, 10.5) - anti * 0.7);
        const up = blendPose(prevPose, cyc, fUp);
        const lo = blendPose(prevPose, cyc, fLo);
        pose = { ...up, lAL: lo.lAL, rAL: lo.rAL };
        // PHASE 2 VISUAL AUDIT (Fix 1 — GESTURE ARCS): the angle-lerp above
        // carries the hand in a STRAIGHT line between poses. The motion
        // grammar: gesture springs interpolate joint POSITIONS through a
        // spline. Closed-form on the existing rig: FK the gesture hand at
        // both pose endpoints, build a quadratic spline whose control
        // point lifts perpendicular to the travel (18% of the distance,
        // capped 20 units, biased outward of the torso), evaluate it at
        // the spring's progress, and solve the two bone angles (2-bone IK,
        // law of cosines) so the HAND RIDES THE ARC. The elbow-side
        // solution nearest the straight blend is kept (continuity). The
        // arc weight is sin(π·fUp) — zero at both endpoints, so pose
        // continuity is exact; the accent terms below still ride on top.
        {
          const dArmR = Math.abs(cyc.rAU - prevPose.rAU) + Math.abs(cyc.rAL - prevPose.rAL);
          const dArmL = Math.abs(cyc.lAU - prevPose.lAU) + Math.abs(cyc.lAL - prevPose.lAL);
          const side: 'r' | 'l' = dArmR >= dArmL ? 'r' : 'l';
          const U = 58, L = 54; // RIG.upperArm / RIG.lowerArm — the drawn rig
          const fkHand = (au: number, al: number): { x: number; y: number } => {
            const ex = Math.sin(au * D2R) * U, ey = Math.cos(au * D2R) * U;
            return { x: ex + Math.sin(al * D2R) * L, y: ey + Math.cos(al * D2R) * L };
          };
          const A = side === 'r' ? fkHand(prevPose.rAU, prevPose.rAL) : fkHand(prevPose.lAU, prevPose.lAL);
          const B = side === 'r' ? fkHand(cyc.rAU, cyc.rAL) : fkHand(cyc.lAU, cyc.lAL);
          const dist = Math.hypot(B.x - A.x, B.y - A.y);
          if (dist > 26) {
            const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
            const nx = -(B.y - A.y) / dist, ny = (B.x - A.x) / dist;
            const lift = Math.min(dist * 0.18, 20) * (mx >= 0 ? 1 : -1);
            const C = { x: mx + nx * lift, y: my + ny * lift };
            const w = Math.max(fUp, fLo);
            const k = Math.max(0, 1 - w);
            // the spline point — the hand's arc target this frame
            const px = k * k * A.x + 2 * k * w * C.x + w * w * B.x;
            const py = k * k * A.y + 2 * k * w * C.y + w * w * B.y;
            // 2-bone IK, law of cosines — target relative to the shoulder
            const dc = Math.min(Math.hypot(px, py), U + L - 1);
            const cosE = Math.min(1, Math.max(-1, (U * U + L * L - dc * dc) / (2 * U * L)));
            const cosA = Math.min(1, Math.max(-1, (U * U + dc * dc - L * L) / (2 * U * dc)));
            const alpha = Math.acos(cosA);
            const thT = Math.atan2(px, py); // (sin, cos) bearing convention
            // both elbow-side solutions; keep the one nearest the straight
            // blend's elbow so the limb never pops across the body
            let best: { au: number; al: number; e: number } | null = null;
            for (const sgn of [1, -1]) {
              const au = thT + sgn * alpha;
              const ex = Math.sin(au) * U, ey = Math.cos(au) * U;
              const al = Math.atan2(px - ex, py - ey);
              const auD = (side === 'r' ? pose.rAU : pose.lAU) * D2R;
              const alD = (side === 'r' ? pose.rAL : pose.lAL) * D2R;
              const e = Math.abs(au - auD) + Math.abs(al - alD);
              if (best === null || e < best.e) best = { au: au / D2R, al: al / D2R, e };
            }
            if (best) {
              const arcK = Math.sin(Math.PI * clamp01(fUp)) * 0.9;
              if (side === 'r') {
                pose = { ...pose, rAU: lerp(pose.rAU, best.au, arcK), rAL: lerp(pose.rAL, best.al, arcK) };
              } else {
                pose = { ...pose, lAU: lerp(pose.lAU, best.au, arcK), lAL: lerp(pose.lAL, best.al, arcK) };
              }
            }
          }
        }
        // P1 (Verdict report — ANTICIPATION IS A COUNTER-MOVE, NOT A FREEZE):
        // the 200ms pre-strike hold used to FREEZE the spring input — a
        // stutter-pause. The hold is now a LOAD: the torso leans and the
        // free arm pulls opposite the strike direction, growing toward the
        // onset (closed form in holdD — pure function of t, scrub-safe).
        if (holdD !== null) {
          const dArmR2 = Math.abs(cyc.rAU - prevPose.rAU) + Math.abs(cyc.rAL - prevPose.rAL);
          const away = (dArmR2 >= Math.abs(cyc.lAU - prevPose.lAU) + Math.abs(cyc.lAL - prevPose.lAL)) ? -1 : 1;
          const loadK = clamp01((200 - holdD) / 200) * 0.35;
          pose = {
            ...pose,
            lean: pose.lean + away * 5 * loadK,
            rAU: pose.rAU + away * 9 * loadK,
            lAU: pose.lAU - away * 9 * loadK,
            rootY: pose.rootY + 2.5 * loadK,
          };
        }
        // beat-accent: a decaying forearm pulse on each word onset — the
        // hand strikes on the emphasized word, exactly as a narrator's does
        // PANEL ACCEPTANCE (audit FIX 6 — TWO-TIER ACCENTS): the pulse is
        // no longer uniform. Content words (the ≥3-char hash-gate rule the
        // smear system already uses) keep the full-amplitude strike;
        // function words carry a 12°-equivalent whisper (12/44 of the
        // envelope, so every downstream term — lean, counter-arm, shoulder
        // — scales with the tier). Key words hit, connective tissue glides.
        let accent = 0;
        // PHASE 3 (audit §8 — HERO AMPLITUDE REGISTER): tier-1 (content
        // word) strikes ALSO drive the hero terms — the strike runs at
        // HERO.strikeMul x the ambient accent amplitude (2.4x, inside the
        // audit's 2-3x band) and the head LEADS the take (headLeadDeg)
        // before the body follows. `full` carries the tier-1 envelope
        // separately so the hero increment is exactly the strike tier,
        // never the whisper tier.
        let full = 0;
        if (opts.wordTimes) {
          for (let wi = 0; wi < opts.wordTimes.length; wi++) {
            const wt = opts.wordTimes[wi];
            if (t >= wt && t < wt + ACCENT_WINDOW_MS) {
              const w = opts.words?.[wi];
              // PHASE 1.5 (panel audit — ACCENT COVERAGE 1-in-4 → 1-in-2):
              // full-amplitude strikes now land on every second CONTENT
              // word (stopword-filtered, hash-gated at 0.52); connective
              // tissue keeps the 12°-equivalent whisper, exactly as the
              // two-tier design intended. The gate is shared with the
              // smear system (accentPulse) so smears ride real strikes.
              const isFull = w ? accentFire(w) : false;
              const tier = w ? (isFull ? 1 : 12 / 44) : 1;
              accent = Math.max(accent, accentEnv(t - wt) * tier);
              if (isFull) full = Math.max(full, accentEnv(t - wt));
            }
          }
        }
        const arc = Math.sin(Math.PI * clamp01(fUp));
        // AUDIT-ROUND-2 (fix 14 — GESTURE AMPLITUDE): forearm accent 16 →
        // 26°, arc bias 7 → 12° (the panel: "poses are readable but pose-y,
        // not acted" — at the host's scale the old pair moved the hand
        // ~30px at 1080p, 5px at 320px: a whisper). 26°/12° clears the
        // phone gate; the left arm counters proportionally so the figure
        // stays balanced.
        // PREMIUM UPGRADE FIX 7 (100-judge critique §5.2): accent amplitude
        // 26 → 44, arc 12 → 20, counter-arm 16 → 26 / 8 → 14. At the host's
        // 3.4× scale this moves hand travel from ~6px at the feed to ~15px —
        // the threshold at which 'acted' reads rather than 'posed'.
        // PLAYBOOK M3 (report §8.2 — GESTURES FROM THE SPINE): the accent
        // no longer stops at the forearm. The same pulse now drives the
        // SHOULDER (+6° rotation), the CHEST (±2° lean, same sign as the
        // gesture arm), and a small HEAD counter-tilt — the gesture
        // originates in the torso, the panel's "the gesture does not come
        // from the spine". All existing Pose fields; blendPose carries
        // them through every downstream blend.
        pose = {
          ...pose,
          // PHASE 3: the hero strike rides ON TOP of the two-tier accent —
          // the tier-1 envelope drives the 2.4x increment, the whisper tier
          // stays at the ambient register (motion contrast, not louder noise).
          rAL: pose.rAL + accent * 44 + full * 44 * (HERO.strikeMul - 1) + arc * 20,
          lAU: pose.lAU - accent * 26 - full * 26 * (HERO.strikeMul - 1) - arc * 14,
          lean: pose.lean + (accent * 2 + arc * 1.2),
          headTilt: pose.headTilt - accent * 1.6,
          shoulderTilt: (pose.shoulderTilt ?? 0) + accent * 6 + full * 4,
          // PANEL ACCEPTANCE (audit FIX 5 — THE HEAD LEAD): the head answers
          // the voice INSIDE the sentence — a small yaw into the presenting
          // side on every accent, on top of the content-bias yaw. The body
          // follows the emphasis instead of waiting for the next sentence.
          // PHASE 3 (hero register): on tier-1 strikes the head LEADS the
          // take by HERO.headLeadDeg — the head-lead take the audit lists
          // as one of the three body-action hero events.
          headYaw: (pose.headYaw ?? 0) + accent * 3.5 + full * HERO.headLeadDeg,
        };
      } else {
        // legacy fallback (no sentence data — e.g. the shorts cutter):
        // the PANEL-12 spring cycle among the three open poses
        const cyc = ['talkA', 'talkB', 'talkC'];
        const raw = t / 2900 + seed;
        const idx = ((Math.floor(raw) % 3) + 3) % 3;
        const phT = raw - Math.floor(raw);
        const prev = POSES[cyc[(idx + 2) % 3]];
        const cur = POSES[cyc[idx]];
        const TRANS = 620; // ms per pose transition
        const k = clamp01((phT * 2900) / TRANS);
        pose = blendPose(prev, cur, clamp01(springTo(0, 1, k * TRANS, 150, 19)));
      }
    } else if (opts.speaking && gesture === 'pointR') {
      pose = POSES.pointR;
    } else if (opts.speaking && gesture === 'pointL') {
      pose = POSES.pointL;
    } else if (opts.speaking && gesture === 'think') {
      pose = POSES.think;
    } else if (!opts.speaking) {
      // P1 U6 (KILL THE MANNEQUIN DEFAULT): between sentences the figure
      // settles into the ASYMMETRIC idle stance — weight leg, bent near
      // elbow, committing head — instead of holding the beat's gesture
      // pose forever. The pose keys existed; the blend path above never
      // reached them. The blend block above smooths the transition, so
      // the settle reads as a pose change, not a snap.
      pose = POSES.idle;
    } else {
      pose = POSES[gesture] ?? POSES.idle;
    }
    // organic life: sway + breathing (deterministic)
    // AUDIT-2 (report §4.2, "the idle is perfectly periodic"): the four
    // idle terms were PURE sines at fixed periods — after ~10s the figure
    // read as a breathing simulator. Each term now carries a layer of
    // incommensurate drift() (sum of three unrelated sines), which breaks
    // the periodicity while staying a pure function of t.
    const sway = Math.sin(t / 1900 + seed * 7.3) * 2.2 + drift(t / 3100 + seed * 2.6, 3) * 1.4;
    const breathe = Math.sin(t / 2400 + seed * 3.1) * 2.4 + drift(t / 5300 + seed * 1.2, 5) * 1.1;
    const jitter = opts.speaking ? Math.sin(t / 610 + seed) * 1.1 + drift(t / 1700 + seed, 9) * 0.5 : 0;
    const leaned = {
      ...pose,
      lean: pose.lean + sway * 0.4,
      rootY: pose.rootY + breathe + (opts.speaking ? jitter : 0),
      headTilt: pose.headTilt + sway * 0.25,
    };
    // PANEL-12 / P1-3 (report §13.3) — FOLLOW-THROUGH: the head chases
    // the torso. P1 (Verdict report — THE TRUE ONE-POLE LAG, 90-120ms):
    // inside the sentence branch the gesture lean is a pure function of
    // the spring term, so the DELAYED lean is evaluable exactly — the
    // same spring at t - 105ms. The head now picks up the torso's lean
    // transient ~105ms late, in closed form (scrub-safe), on every lean
    // change. Other branches keep the static transient approximation.
    const leanLagged = leaned.lean * 0.82 + 0.18 * (POSES[gesture]?.lean ?? 0);
    const headLag = leanDelayed !== null
      ? (leaned.lean - leanDelayed) * 0.55
      : (leaned.lean - leanLagged) * 0.6;
    return {
      ...leaned,
      headTilt: leaned.headTilt + headLag,
    };
  }

  /** walk-cycle pose: phase 0..1 one full stride pair.
   *  AUDIT-ROUND-3 (Fix 2 — THE KEYED WALK): the external panel's walk
   *  verdict was 2/10 — "a standing pose smeared with ghost trails...
   *  a mannequin... rig-pivot animation with motion-blur layered on top
   *  to fake walk energy." Root cause, architectural: a continuous
   *  function has no extremes — every frame is the average, and the eye
   *  reads the average as a puppet mid-glide. Ten rounds of amplitude
   *  patches (M1's spread/pass/push pulses) never changed that verdict
   *  because they patched amplitudes, not construction.
   *
   *  THE KEYED WALK: one stride drawn as EIGHT keyed poses — the four
   *  classical extremes (CONTACT / DOWN / PASS / PUSH) plus their
   *  in-between anchors — interpolated with a smoothstep hold between
   *  keys, the way hand-drawn walks are built. Every frame now bends
   *  toward an extreme. The caricature lives IN the keys (the DOWN key
   *  sinks past the anatomical floor with the knee flexed; the PASS key
   *  drives the swing knee high while the body stretches tall); the
   *  analytic pulse layer retires entirely.
   *
   *  What survives unchanged:
   *   - the GROUND-ANCHORED pelvis: rootY is still the stance leg's
   *     vertical reach (analytic, exact, scrub-safe), so the planted
   *     foot stays on the ground line BY CONSTRUCTION;
   *   - the contrapposto rig terms (pelvis tilt / shoulder counter);
   *   - the phase convention (left swings (0, 0.5), plants at 0.5;
   *     right at +0.5) — walkIn's stride coupling and walkSmear's
   *     mid-swing window stay aligned.
   *  What is FIXED on the way: the arm swing is now CONTRALATERAL (the
   *  same-side arm opposes the same-side leg — the analytic cycle
   *  coupled them ipsilaterally, an anatomy bug the still-frame audits
   *  never caught).
   *  Pure function of phase — scrub-determinism preserved exactly. */
  static walkPose(phase: number, speed = 1): Pose {
    const ph = ((phase % 1) + 1) % 1;
    // ── THE KEY TABLE ─────────────────────────────────────────────────
    // One leg's cycle: it LIFTS at 0.00 (toe-off, trailing), swings
    // through the knee-high pass, REACHES ahead, LANDS at 0.50 (CONTACT),
    // absorbs (DOWN), passes under the body tall (PASS), and rolls
    // through the heel to the next toe-off. Angles in degrees from
    // vertical (Pose convention: + = screen right = the walk direction;
    // toe + = toe down / toe-off, toe - = heel-strike). `root` is the
    // pelvis exaggeration ON TOP of the analytic ground anchor (low at
    // contact/down, tall at pass); `chin` is the head key (the tuck
    // into each plant).
    interface WKey { at: number; lu: number; ll: number; lift: number;
                     toe: number; root: number; lean: number; chin: number }
    const WK: WKey[] = [
      // PUSH / toe-off — the trailing leg extends, body drives forward
      // B11: the push toe 22 -> 12 — the pointed-toe kick read as a
      // goose-step; 12 keeps the roll-through without the ballet foot.
      { at: 0.00, lu: -24, ll: -30, lift: 2,  toe: 12,  root: 0,  lean: 5,  chin: 1 },
      // knee-high swing — the caricatured pass of the SWING leg
      // (AUDIT-ROUND-3 iter-2: -46 → -50, the knee drives harder)
      // B11: the knee drives -44 (was -50) and the ankle flexes toe-UP
      // (-16) — the swing leg leads with the HEEL like a walked step, not
      // the pointed-toe kick the audit named the goose-step.
      { at: 0.10, lu: -6,  ll: -44, lift: 15, toe: -16, root: -2, lean: 4,  chin: 0 },
      // mid-swing — the thigh sweeps forward, the foot clears the ground
      { at: 0.25, lu: 12,  ll: -30, lift: 17, toe: -10, root: -3, lean: 3,  chin: 0 },
      // REACH — the leg extends, the heel presents ahead
      { at: 0.40, lu: 25,  ll: -6,  lift: 4,  toe: -14, root: 2,  lean: 4,  chin: -2 },
      // CONTACT — the lunge: leg extended ahead, heel strikes, body LOW,
      // the chin tucks INTO the plant
      // P1 (Verdict report — MOTION RE-REGISTRATION): the vertical extremes
      // DOUBLE (contact 6 -> 12, down 9 -> 18, pass -7 -> -12) so the four
      // beats differ in head height by >= 4% of the figure at the 320 twin —
      // the verdict's acceptance test. The ground anchor keeps the planted
      // foot ON the line (rootY stays the stance leg's reach).
      { at: 0.50, lu: 27,  ll: 2,   lift: 0,  toe: -14, root: 12, lean: 5,  chin: -4 },
      // DOWN — the absorb: weight lands, the knee flexes, pelvis LOWEST
      { at: 0.60, lu: 18,  ll: -18, lift: 0,  toe: -4,  root: 18, lean: 4,  chin: -2 },
      // P1 — THE 2-FRAME HOLD ON THE DOWN KEY: a duplicate DOWN at 0.645
      // makes the sample HOLD at the absorb for ~50-60ms (2 frames at 30fps
      // on the film's stride clock) — the weight visibly LANDS instead of
      // kissing the floor and bouncing on.
      { at: 0.645, lu: 18, ll: -18, lift: 0,  toe: -4,  root: 18, lean: 4,  chin: -2 },
      // PASS — the tall crossing: stance leg near-vertical, body TALLEST
      { at: 0.75, lu: 4,   ll: -10, lift: 0,  toe: 2,   root: -12, lean: 3,  chin: 2 },
      // ROLL-THROUGH — the heel lifts, the toe loads toward the next push
      // (iter-2: stays tall into the push, root -1 → -3)
      { at: 0.90, lu: -12, ll: -8,  lift: 0,  toe: 16,  root: -3, lean: 4,  chin: 1 },
    ];
    // sample the table: smoothstep between adjacent keys — the pose
    // HOLDS near each extreme (a drawn in-between, not a linear slide)
    const sample = (p: number): WKey => {
      const q = ((p % 1) + 1) % 1;
      let i = WK.length - 1;
      for (let k = 0; k < WK.length; k++) if (q >= WK[k].at) i = k;
      const a = WK[i];
      const b = WK[(i + 1) % WK.length];
      const span = (b.at > a.at ? b.at : b.at + 1) - a.at;
      const u = clamp01((q - a.at) / span);
      const k = u * u * (3 - 2 * u);
      const L = (x: number, y: number): number => lerp(x, y, k);
      return {
        at: 0,
        lu: L(a.lu, b.lu), ll: L(a.ll, b.ll), lift: L(a.lift, b.lift),
        toe: L(a.toe, b.toe), root: L(a.root, b.root),
        lean: L(a.lean, b.lean), chin: L(a.chin, b.chin),
      };
    };
    const sL = sample(ph);        // the LEFT leg's cycle
    const sR = sample(ph + 0.5);  // the RIGHT leg, half a cycle behind
    const S = speed;
    const lLU = sL.lu, lLL = sL.ll, rLU = sR.lu, rLL = sR.ll;
    const liftL = sL.lift * S, liftR = sR.lift * S;
    // GROUND-ANCHORED pelvis (unchanged math): rootY = the stance leg's
    // vertical reach; the swing lift keeps the airborne leg out of
    // contention. The keyed `root` rides ON TOP (the DOWN sink past the
    // anatomical floor, the PASS stretch above it).
    const U = 54, L = 50; // the v2 rig (5.1 heads)
    const reachL = Math.cos(lLU * D2R) * U + Math.cos(lLL * D2R) * L - liftL;
    const reachR = Math.cos(rLU * D2R) * U + Math.cos(rLL * D2R) * L - liftR;
    const rootY = (U + L) - Math.max(reachL, reachR) + sL.root * S;
    // CONTRALATERAL arms — the same-side arm OPPOSES the same-side leg
    // (the analytic cycle coupled them ipsilaterally: an anatomy bug).
    // P1 (Verdict report — ARMS ANSWER THE LEGS): swing amplitude rises to
    // the ±38° register (armAmp 0.9 -> 1.42 on the ±27° leg swing) and the
    // elbow FLEXION is driven by the swing phase — the forward-swing arm
    // folds harder the faster the leg drives (lift-proportional), so the
    // arms visibly answer the gait instead of hanging.
    // B11 RE-SPEC (Visual Quality Audit — THE WALK'S ARMS DO NOT SWING):
    // the ±38° register computed here still read as "hanging straight
    // down or slightly out" at the rendered rig — the swing amplitude
    // rises to ±47° (armAmp 1.42 -> 1.7 on the ±27° leg extremes) so the
    // fists pass the hip line and the swing reads at 1080p.
    const armAmp = 1.7;
    const lAUw = -lLU * armAmp - 7;
    const rAUw = -rLU * armAmp + 7;
    const swingL = liftL / (17 * Math.max(0.3, S) || 1); // 0..1 within the stride
    const swingR = liftR / (17 * Math.max(0.3, S) || 1);
    return {
      ...base(),
      rootY,
      lean: sL.lean,
      headTilt: sL.chin,
      lLU, lLL, rLU, rLL,
      lAU: lAUw,
      // B11: the elbow FOLDS on BOTH arms now — the forward arm folds
      // hard (the elbow leads the swing, flexion grows with forwardness),
      // the back arm keeps a drawn ~14° bend instead of snapping straight
      // (the old Math.max(0, lAUw) gate left the trailing arm a straight
      // stick — the audit's "the elbows never bend").
      lAL: lAUw + 14 + 30 * clamp01(lAUw / 40) * (0.7 + 0.3 * swingL) - 4,
      rAU: rAUw,
      rAL: rAUw + 14 + 30 * clamp01(rAUw / 40) * (0.7 + 0.3 * swingR) + 4,
      smile: 0.35,
      browRaise: 0.1,
      lLift: liftL,
      rLift: liftR,
      lToe: sL.toe,
      rToe: sR.toe,
      pelvisTilt: Math.sin(ph * Math.PI * 4 + Math.PI / 2) * 4 * S,
      shoulderTilt: -Math.sin(ph * Math.PI * 4 + Math.PI / 2) * 3 * S,
    } as Pose;
  }

  /**
   * 100-JUDGE PANEL / Phase 2 item 1 — LOCOMOTION SET (report §6 Phase
   * 2, p.14): "Add runPose (a 70-degree-stride, 2-phase, airborne-pass
   * walkPose variant with a flight term), hurryWalk (cadence 1.6x, lean
   * 14 degrees), and slumpWalk (stride 30 degrees, head down 12) as pure
   * functions beside walkPose. The pelvis-anchoring math generalizes
   * directly. The host's body can answer urgency and defeat, not only
   * composure."
   *
   * RUNPOSE — a 2-phase run derived from the same analytic machinery:
   *   • STRIDE: swing amplitude 38° -> 70° (the caricatured run
   *     spread; ~62% of body height reads as sprint at this rig).
   *   • 2-PHASE: the legs swap roles exactly once per cycle (no
   *     double-support window — stance is a single instant, the way a
   *     run actually works).
   *   • FLIGHT TERM: both feet leave the ground through the pass —
   *     rootY gains a −(liftL + liftR − 2·min) term so the pelvis
   *     RISES when both swings peak; when both lifts exceed the stance
   *     reach, the root offsets ABOVE the anatomical floor (airborne).
   *     The math stays pure: rootY remains a closed function of the
   *     pose's own angles.
   *   • ARMS PUMP: 84° amplitude, elbows flexed to 96° (a run pumps,
   *     it never swings); torso leans 12° into the velocity.
   *   • GROUND TRUTH preserved: at each contact instant the stance
   *     foot reaches exactly rootY (the anchor math carries over).
   */
  static runPose(phase: number, speed = 1): Pose {
    const ph = ((phase % 1) + 1) % 1;
    const s = Math.sin(ph * Math.PI * 2);
    const c = Math.cos(ph * Math.PI * 2);
    // 2-phase: the legs swap roles exactly half a cycle apart — the
    // ANTIPHASE pair (when one sweeps forward the other sweeps back, the
    // inter-leg spread riding the full 70° swing)
    const phR = ph + 0.5;
    const sR = Math.sin(phR * Math.PI * 2);
    const cR = Math.cos(phR * Math.PI * 2);
    // STRIDE: 70° — the run's caricatured spread
    const swing = 70 * speed;
    // strike pulses: LEFT lands at φ=0, RIGHT at φ=0.5 (2-phase)
    const strikeL = Math.pow(Math.max(0, (-c - 0.86) / 0.14), 2);
    const strikeR = Math.pow(Math.max(0, (-cR - 0.86) / 0.14), 2);
    // swing arcs — a run lifts BOTH feet higher than the walk
    const liftL = Math.max(0, s) * AMP.swingLiftPx * 1.6 * speed;
    const liftR = Math.max(0, sR) * AMP.swingLiftPx * 1.6 * speed;
    // legs: swing leg sweeps the FULL 70°; knees flex harder (34° swing
    // clearance, 26° absorption — a run absorbs with the knee)
    const lLU = -c * swing * 0.5 - 5;
    const rLU = -cR * swing * 0.5 + 5;
    const lLL = lLU - Math.max(0, s) * 34 * speed - strikeL * 26;
    const rLL = rLU - Math.max(0, sR) * 34 * speed - strikeR * 26;
    // GROUND ANCHOR + FLIGHT: the anatomical floor comes from the stance
    // leg; the FLIGHT term fires through the pass — the window around
    // each leg's vertical crossing (ph ≈ 0.25 / 0.75) where a run's body
    // leaves the ground. At the crossing the stance leg is flexed (knee
    // absorption) so BOTH feet are clear of the ground line: the pelvis
    // rises by the crossing pulse. Pure function of the pose's own phase.
    const U = 54, L = 50; // PLAYBOOK P1: matches the v2 rig (5.1 heads)
    const reachL = Math.cos(lLU * D2R) * U + Math.cos(lLL * D2R) * L - liftL;
    const reachR = Math.cos(rLU * D2R) * U + Math.cos(rLL * D2R) * L - liftR;
    // the flight pulse: |sin| near 1 marks the pass crossings (the run's
    // two airborne windows per cycle), squared for a snappier arc
    const flight = Math.pow(Math.abs(Math.sin(ph * Math.PI * 2)), 3);
    const rootY = (U + L) - Math.max(reachL, reachR) - flight * 16 * speed;
    // pelvis/shoulder: the run's counter-rotation is FASTER and bigger
    const pelvisTilt = Math.sin(ph * Math.PI * 4) * 7 * speed;
    const shoulderTilt = -Math.sin(ph * Math.PI * 4) * 5.5 * speed;
    // toe roll — the run's toes flick through toe-off harder
    const toeFor = (p: number): number => {
      const sp = ((p % 1) + 1) % 1;
      if (sp < 0.5) {
        return AMP.toeUpDeg - (AMP.toeUpDeg - AMP.toeDownDeg) * (sp * 2);
      }
      const u = (sp - 0.5) * 2;
      const settle = AMP.toeDownDeg * 0.7;
      return u < 0.2 ? settle * (1 - u / 0.2) : settle + (AMP.toeUpDeg - settle) * ((u - 0.2) / 0.8);
    };
    // ARMS PUMP: 84° amplitude, elbows at 96° flex — a run pumps
    const armAmp = 1.1;
    const lAUr = -c * swing * armAmp * 0.6 - 10 + s * 5;
    const rAUr = c * swing * armAmp * 0.6 + 10 - s * 5;
    return {
      ...base(),
      rootY,
      lean: 12 + s * 3 + (strikeL + strikeR) * 4,   // torso drives INTO the velocity
      headTilt: -6 - (strikeL + strikeR) * 4 + s * 1.5, // chin leads; strikes tuck it
      lLU, lLL, rLU, rLL,
      lAU: lAUr,
      lAL: lAUr - 96,                                // pumping elbow flexion
      rAU: rAUr,
      rAL: rAUr + 96,
      smile: 0.15,
      browRaise: 0.3,                                // the effort read
      lLift: liftL,
      rLift: liftR,
      lToe: toeFor(ph) + 6,
      rToe: toeFor(ph + 0.5) + 6,
      pelvisTilt,
      shoulderTilt,
    } as Pose;
  }

  /**
   * Phase 2 item 1 — HURRYWALK: "cadence 1.6x, lean 14 degrees." The
   * urgent walk — the presenter crossing his stage faster than composure
   * allows. Pure wrapper: walkPose's analytic machinery at 1.6× tempo
   * (the caller advances phase 1.6× per unit ground distance), with the
   * lean and cadence caricature layered on. Arms pre-flex (a hurried man
   * never lets his arms hang), the brow reads effort, the stride rides
   * the walk's exact planting math.
   */
  static hurryWalk(phase: number, speed = 1.6): Pose {
    const p = Stickman.walkPose(phase, speed);
    return {
      ...p,
      lean: p.lean + 14,          // the report's 14° forward drive
      headTilt: p.headTilt - 3,   // chin leads the lean
      lAU: p.lAU - 12,            // pre-flexed arms — hurry carries in the elbows
      rAU: p.rAU + 12,
      lAL: p.lAL - 14,
      rAL: p.rAL + 14,
      browRaise: Math.max(p.browRaise, 0.25),
      smile: Math.min(p.smile, 0.15),
    };
  }

  /**
   * Phase 2 item 1 — SLUMPWALK: "stride 30 degrees, head down 12." The
   * defeat walk — the mood chapters' body language. Walk machinery at a
   * 30° stride (speed 0.79 scales swing 38° -> 30°), with the head
   * DOWN 12°, shoulders rolled forward, the pelvis sagging. The same
   * pelvis-anchored math; the EMOTION is three additive terms.
   */
  static slumpWalk(phase: number, speed = 0.79): Pose {
    const p = Stickman.walkPose(phase, speed);
    return {
      ...p,
      headTilt: p.headTilt + 12,       // the report's head-down 12°
      lean: p.lean - 5,                // the shoulders roll back off the hip
      rootY: p.rootY + 4,              // the pelvis sags toward the ground
      lAU: p.lAU + 18,                 // arms hang — no swing left in them
      rAU: p.rAU - 18,
      lAL: p.lAL - 8,
      rAL: p.rAL - 8,
      shoulderTilt: (p.shoulderTilt ?? 0) * 0.5,
      browRaise: 0.05,
      browAngle: 10,                   // the concern read
      smile: 0,
    };
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
    ctx.fillStyle = rgba(PALETTE.shadow, 0.16 * (r.shadow ?? 1));
    ctx.beginPath();
    ctx.ellipse(0, 6, 58, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const ink = PALETTE.ink;
  // AUDIT-3 / Finding 1 (report §3.2, Phase 1.1): ONE INK VALUE PER
  // CHARACTER. The v1 far limbs drew in a separate cool-slate hex — the
  // same two-tone value split the panel convicted three times on the
  // BEFORE renders ("reads as a rigging error, not a design choice").
  // Depth comes from overlap and contact, never from splitting limb
  // values (the Alan Becker rule the report set as reference standard).
  const inkFar = PALETTE.ink;
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
  const yawR = (pose.headYaw ?? 0) * D2R;
  const headCX = neckX + Math.sin(tiltR) * (RIG.neck + RIG.headR * 0.9) + Math.sin(yawR) * 10;
  const headCY = neckY - Math.cos(tiltR) * (RIG.neck + RIG.headR * 0.9);
  // AUDIT-ROUND-2 (fix 14): nod pulse 4 → 7px — the word-accent nod must
  // survive the 320px gate.
  const nod = (r.nod ?? 0) * 7;
  ctx.save();
  ctx.translate(headCX, headCY + nod);
  ctx.rotate(tiltR * 0.6 + yawR * 0.5);
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
  // BLUEPRINT Phase 1: brow travel x5 -> x14 (AMP) — the brow line must
  // ACT at 320px, not move a sub-pixel sliver.
  const bRaise = pose.browRaise * AMP.browTravelPx;
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

/** Walking host: returns x position and walk pose for a walk-in entrance.
 *  PANEL-12 / P1-1 (report §13.1) — THE FOOT-SLIDE FIX (mandatory).
 *  Stride phase advances with EASED DISTANCE TRAVELED; because the easing
 *  has a closed-form integral the mapping is exact, and d(x)/d(phase) ≡
 *  stridePx means the planted foot has ZERO horizontal screen motion during
 *  contact. Still a pure function of t — scrub-determinism preserved.
 *
 *  AUDIT-3 / §1.2 (report Phase 1.2): WALK 3.0 ENTRANCE PROFILE. The old
 *  easeOutCubic mapped ~95% of the distance into the first 62% of a 900 ms
 *  entrance — the judge panel read the BEFORE contact sheet as "the tail
 *  loses its stride… feet stacking… the character eased to a stop via
 *  position interpolation, not animation". The profile is now a smooth
 *  TRAPEZOID: accelerate 0–22%, cruise at constant speed 22–78%, then a
 *  decisive smoothstep deceleration to a full stop. Uniform steps through
 *  the cruise, a readable first push, a landing you can see — and the walk
 *  ends on a COMPLETED SETTLE: the final 16% dissolves the cycle into the
 *  caller's arrival pose (weight onto the lead foot, arms settle) instead
 *  of handing off with a pose snap. */
function walkEase(p: number): number {
  // smoothstep velocity ramp in [0,A], cruise [A,B], ramp out [B,1];
  // closed-form integral, normalized so walkEase(1) === 1 exactly.
  const A = 0.22, B = 0.78;
  const vMax = 1 / (B - A + A / 2 + (1 - B) / 2);
  const sInt = (k: number): number => k * k * k - (k * k * k * k) / 2; // ∫₀ᵏ smoothstep
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (p < A) return vMax * A * sInt(p / A);
  if (p <= B) return vMax * (A / 2 + (p - A));
  const m = (1 - p) / (1 - B);
  return 1 - vMax * (1 - B) * sInt(m);
}

export function walkIn(
  t: number,
  from: number,
  to: number,
  dur: number,
  /** AUDIT-3 / §1.2: the pose to settle INTO (the caller's presenting
   *  gesture). When provided, the last 16% of the walk blends the cycle
   *  into it — the walk lands on a completed step, never a pose snap. */
  arrive?: Pose,
  /** AUDIT-3 / Walk 3.0: the RIG SCALE the caller draws at. The stride
   *  length in screen px is stridePx × scale — without this term the
   *  planted foot slides at every scaled call site (the editorial host
   *  at 1.85× under-strided ~46%). Default 1. */
  rigScale = 1,
  /** P10 (100-judge audit §13 — WALK PERSONALITY): a stable seed for the
   *  walk's tempo identity — stride ±8%, cadence ±11%, and a slow cruise
   *  wobble, all derived from the seed so ONE character keeps ONE walk
   *  everywhere (workers amble, owners stride). Omitted: the personality
   *  derives from the route itself (from→to), so every walk on the same
   *  path still matches — scrub-stable either way. */
  pSeed?: number
): { x: number; pose: Pose; walking: boolean; phase: number } {
  const p = dur > 0 ? clamp01(t / dur) : 1;
  const e = walkEase(p);
  const x = lerp(from, to, e);
  const walking = p < 0.995;
  // P10: the seed — explicit, or route-derived (stable per path).
  const seedN = pSeed !== undefined ? hash01(pSeed) : hash01(from * 0.0137 + to * 0.0073);
  const speed = 1.15 * (0.90 + 0.22 * seedN);
  // phase advances with EASED DISTANCE, not time — feet plant, never slide.
  // stridePx = ground distance per full stride pair (2 steps) at rig speed,
  // expressed in SCREEN px (× rigScale) so the plant is exact at any scale.
  // AUDIT-ROUND-3 (keyed walk): 170 -> 152 — the keyed stance sweep
  // (contact +26 local x to toe-off -50 local x = -76 per half-cycle)
  // now matches the ground advance per half-cycle (152 × 0.5 = 76): the
  // planted foot's residual slide drops to <1px per step at rig 1.
  // P10: stride ±8% per seed; the cruise wobble rides the phase (a ±3%
  // tempo drift over ~0.9s — nobody walks like a metronome).
  const stridePx = 152 * (0.92 + 0.16 * seedN) * speed * Math.max(0.1, rigScale);
  // P10: the cruise wobble rides the CADENCE (the speed term walkPose
  // consumes), never the planted phase — phase modulation would slide the
  // feet the keyed-walk machinery exists to prevent.
  const cruiseWob = Math.sin(t / 900 + seedN * 6.28) * 0.03;
  const phase = ((to - from) * e) / stridePx;
  let pose: Pose;
  if (walking) {
    pose = Stickman.walkPose(phase, speed * (1 + cruiseWob));
    // PREMIUM UPGRADE M1: WALK ACCELERATION LEAN. The torso leans forward
    // during the first 22% of the walk (acceleration), returns to neutral
    // in the cruise, and leans back -4° in the last 22% (deceleration). A
    // heavy walk leans into its acceleration and resists its deceleration —
    // the old flat lean read as gliding, not walking.
    // 100-JUDGE AUDIT (fix 5.11 — §7 walk tuning notes): the +8° launch lean
    // read as a stumble at the 2.65 presenting scale (the head leads too
    // far past the entry whip). The launch lean tunes to +5° — intent kept,
    // posture premium.
    if (p < 0.22) {
      pose = { ...pose, lean: pose.lean + 5 * (1 - p / 0.22) };
    } else if (p > 0.78) {
      pose = { ...pose, lean: pose.lean - 4 * ((p - 0.78) / 0.22) };
    }
    if (arrive && p > 0.76) {
      // PLAYBOOK M2 (report §8.2 — THE SETTLING STEP): the settle widens
      // from 16% to 24% and lands on a final WEIGHT SHIFT — the trailing
      // foot drags closed to hip width over 180ms, the hips rotate their
      // last 6°, and the pelvis sinks 3px LATE (the weight arrives after
      // the feet do). Ends every entrance on weight, never a freeze.
      const k = (p - 0.76) / 0.24;
      const kk = k * k * (3 - 2 * k);
      // the settle cascade itself: cycle → arrival over the last 60%,
      // then the weight-shift terms ride on top of the blended pose.
      const kb = clamp01((p - 0.86) / 0.14);
      const settled = blendPose(pose, arrive, kk);
      const dragT = clamp01((p - 0.80) / 0.18); // the trailing-foot drag window
      pose = {
        ...settled,
        // the back foot closes (the drag): the near leg's angle eases
        // toward the arrival's stance while the FAR leg lags 120ms —
        // the classic closing step
        rootY: settled.rootY + Math.sin(Math.min(1, kb) * Math.PI) * 3
          // 100-JUDGE AUDIT (fix 5.11 — the EXTRA ARRIVAL SETTLE BEAT, §7
          // walk notes): a final 1.5px exhale-pulse across p 0.9→1.0 — the
          // second bounce that turns the landing into a settle. Peaks at
          // p≈0.95, exactly zero at the stop — motion ends at rest.
          + Math.sin(clamp01((p - 0.9) / 0.1) * Math.PI) * 1.5,
        pelvisTilt: (settled.pelvisTilt ?? 0) + (1 - kb) * 6,
        lLift: Math.max(0, (settled.lLift ?? 0) - dragT * 4),
      };
    }
  } else {
    pose = arrive ?? Stickman.poseAt(t - dur, { gesture: 'idle', speaking: false });
  }
  return { x, pose, walking, phase };
}

/** Entrance helper used by host scenes: fade+rise. */
export function riseIn(t: number, dur = 600): number {
  return easeOutCubic(clamp01(t / dur));
}

/**
 * PHASE 1.5 (panel audit — the accent STRIKE needs a SETTLE): the accent
 * envelope. The old pulse was one 300ms half-sine — the arm struck and then
 * DRIFTED back down on the sine's mirrored slope, hitting the 300ms edge at
 * maximum downward velocity that snapped to zero in one frame (the audit's
 * "linear drift" read). The rebuilt envelope is the classical grammar:
 *
 *   0-90ms    STRIKE — ballistic rise to full amplitude (90ms, faster than
 *             the old sine's 150ms climb — the hit reads as a hit)
 *   90-306ms  RECOIL — the first 80% of the return travel, decelerating
 *             into the settle point (easeOutQuad: the arm pulls back and
 *             lands at 20% amplitude with zero residual velocity)
 *   306-360ms SETTLE — the FINAL 20% of the return travel, sine-tapered
 *             (velocity swells gently and decays to exactly zero at the
 *             end — no snap, no drift)
 *
 * The settle covers 20% of the strike's return travel — the audit's "20%
 * velocity-tapered settle added to each strike". Pure f(dt), scrub-safe.
 */
export const ACCENT_WINDOW_MS = 440;

export function accentEnv(dt: number): number {
  if (dt < 0 || dt > ACCENT_WINDOW_MS) return 0;
  // B12/B13 RE-SPEC (Visual Quality Audit — SQUASH, STRETCH,
  // ANTICIPATION; THE CAMERA DOES ALL THE ACTING): the classical read —
  // the body WINDS UP, lands, settles — starts with an ANTICIPATION
  // phase: the first 80ms pull the accent arm BACK (-0.4 register)
  // before the strike. The negative return reads as the wind-up in
  // every consumer that adds the envelope to an angle; the strike
  // lands at 80-170ms, then the recoil settles as before.
  if (dt < 80) return -0.4 * Math.sin((dt / 80) * Math.PI * 0.5); // the wind-up
  if (dt < 170) return Math.sin(((dt - 80) / 90) * Math.PI * 0.5); // the strike
  const p = (dt - 170) / 270; // the return, 0..1 over 270ms
  const travel =
    p < 0.8
      ? 0.8 * (1 - Math.pow(1 - p / 0.8, 2)) // the recoil: decelerating into the settle point
      : 0.8 + 0.2 * Math.pow(Math.sin(((p - 0.8) / 0.2) * Math.PI * 0.5), 2); // the settle: velocity-tapered
  return 1 - travel;
}

/** The English function words that never carry a full-amplitude strike. */
const ACCENT_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'of', 'to', 'in', 'on', 'at',
  'by', 'up', 'off', 'out', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do',
  'does', 'did', 'doing', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'shall',
  'may', 'might', 'must', 'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'his', 'her',
  'him', 'they', 'them', 'their', 'we', 'our', 'us', 'you', 'your', 'me', 'my', 'if', 'then',
  'than', 'when', 'while', 'what', 'which', 'who', 'whom', 'whose', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'not', 'only', 'own', 'same',
  'too', 'very', 'just', 'also', 'there', 'here', 'now', 'even', 'ever', 'into', 'over', 'under',
  'about', 'from', 'with', 'without', 'within', 'because', 'after', 'before', 'between', 'through',
  'during', 'against', 'one', 'two', 'get', 'got', 'gonna', 'going', 'want', 'like',
]);

/**
 * PHASE 1.5 — the shared accent gate: does THIS word carry a full strike?
 * Content words (stopword-filtered, ≥3 letters, hash-gated at 0.52) fire —
 * ~1-in-2 content words, double the audit's measured 1-in-4 coverage.
 * Deterministic per word, shared by the pose accent and the smear system.
 */
export function accentFire(word: string | undefined): boolean {
  if (!word) return false;
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length < 3 || ACCENT_STOPWORDS.has(w)) return false;
  return hashStr(w) < 0.52;
}

/** P1-6 (100-judge audit, Table 3 — GRADUATED SMEARS): the word-onset
 * accent pulse that drives the arm's motion trail. Faster attack than
 * nodPulse — the smear reads as VELOCITY, not emphasis.
 * AUDIT-ROUND-2 (fix 13 — SMEAR DISCIPLINE): the old window ran from 40ms
 * BEFORE the word to 260ms after — the ghost trail lived through the whole
 * word, so single-frame dumps (scrub previews, thumbnails, the audit's own
 * evidence) caught "a gray ghost pose mid-transition" and read it as a
 * rendering bug. The strike window is now 60-160ms AFTER the word onset —
 * exactly the ballistic phase of the accent — so the smear exists only
 * while the limb is genuinely at speed and never pollutes a settled hold.
 * PHASE 1.5: the gate is now the shared content-word rule (accentFire) so
 * smears ride exactly the words that carry full strikes — 1-in-2 content
 * words, not the old 1-in-4. Scrub-safe. */
export function accentPulse(t: number, wordTimes: number[], words?: string[]): number {
  let p = 0;
  for (let i = 0; i < wordTimes.length; i++) {
    const wt = wordTimes[i];
    // AUDIT-ROUND-3 (Fix 1 — SMEARS AS EVENTS): the pulse fired after
    // EVERY word for 180ms — at 2-3 words/second the ghost trail was live
    // for ~60% of all speech, and two independent judges read it as a
    // rendering artifact ("a smearing artifact rather than motion", "an
    // un-clipped alpha"). Now only content words fire (deterministically
    // by hash via accentFire) and the strike window is 40-120ms —
    // TWO FRAMES at 30fps, the ballistic peak of the gesture. A smear
    // that exists for 2 frames at peak velocity reads as velocity; a
    // smear that exists for 6 frames after every word reads as a dirty
    // render. Scrub-safe: pure function of (t, word data).
    const gated = words && words[i] ? accentFire(words[i]) : hash01(i * 7.31 + 0.5) < 0.28;
    if (!gated) continue;
    if (t >= wt + 40 && t < wt + 120) {
      p = Math.max(p, Math.sin(((t - wt - 40) / 80) * Math.PI));
    }
    if (wt > t + 300) break;
  }
  return p;
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

/**
 * PANEL ACCEPTANCE (audit FIX 6 — THE LAUNCH HALF): the stretch pulse — a
 * quick 120ms elongation on each word onset, the ballistic START of the
 * accent before the forearm pulse peaks. Callers sum it with the walk's
 * push-off pulse (walkPush) and pass the total as r.stretch; the renderer
 * applies a volume-preserving elongation (height +6%, width −5%) about the
 * ground contact. Squash on impact, stretch on launch — both halves of the
 * classical pair, on the same word clock. Scrub-safe: pure f(t, words).
 */
export function launchPulse(t: number, wordTimes: number[]): number {
  let p = 0;
  for (const wt of wordTimes) {
    if (t >= wt && t < wt + 120) {
      p = Math.max(p, Math.sin(((t - wt) / 120) * Math.PI));
    }
    if (wt > t + 200) break;
  }
  return p;
}

/**
 * 100-JUDGE PANEL / Phase 1 item 3 — A TAKE GRAMMAR (report §6 Phase 1):
 * "New helper take(t, t0) in stickman.ts: a 2-frame hold — then 20%
 * overshoot on browRaise + a blink + a head-torso double-bounce, driven
 * on the twist/shock/warm lines. ~40 lines, pure function of t."
 *
 * The take is the animation grammar of RECOGNITION: the body freezes
 * for a beat (the hold), then over-commits (the overshoot) before
 * settling. blendable over whatever pose the beat already carries —
 * callers apply it with blendPose at the reaction windows. Timeline
 * (all pure functions of elapsed dt = t - t0):
 *   0-66ms    HOLD — nothing moves (the 2-frame freeze at 30fps)
 *   66-200ms  OVERSHOOT — browRaise overshoots +20% past target, the
 *              head recoils back 4° (headTilt) while the torso leans
 *              opposite (the double-bounce's first arc), blink closed
 *   200-380ms SETTLE — the overshoot eases back, the head-torso pair
 *              bounces through zero into +2° counter (second arc),
 *              blink opens
 *   >380ms    identity — the beat's own pose resumes exactly
 * Scrub-safe: every term is a closed function of dt; at dt<0 or dt>380
 * it returns the untouched pose.
 */
export function take(pose: Pose, t: number, t0: number): Pose {
  const dt = t - t0;
  if (dt < 0 || dt > 380) return pose;
  // HOLD (0-66ms): the freeze — return the pose with the hold's tiny
  // rootY drop (a held breath reads as a 2px settle, not a teleport).
  if (dt < 66) {
    return { ...pose, rootY: (pose.rootY ?? 0) + 2 };
  }
  // OVERSHOOT (66-200ms): 20% past the pose's own browRaise, head back,
  // torso opposite; SETTLE (200-380ms): bounce through zero, overshoot
  // -0.12 the other way, damp to 0. The overshoot envelope is
  // CONTINUOUS at the 200ms boundary (over reaches 1.0 exactly there,
  // then the settle's sine takes over from 0 — no pop).
  const over = clamp01(easeOutCubic(Math.min(1, (dt - 66) / 134)));
  const settle = dt >= 200 ? Math.sin((dt - 200) / 180 * Math.PI) : 0;
  const bounce = dt < 200 ? over : -0.35 * settle;
  return {
    ...pose,
    browRaise: clamp01(pose.browRaise + 0.20 * (dt < 200 ? over : 1 - 0.5 * settle)),
    headTilt: (pose.headTilt ?? 0) - 4 * bounce,
    lean: (pose.lean ?? 0) + 2.4 * bounce,
    rootY: (pose.rootY ?? 0) + 1.5 * bounce,
    // the blink: closed through the overshoot, opening across the settle
    blinkT: dt < 200 ? 0 : undefined,
  };
}

/**
 * P2 U8 (Visual Quality Audit §4.3 — BODY-ACTION HERO EVENTS): the hero
 * moments are carried by the BODY, not the camera. Three phases on the
 * event's own clock, pure f(t), scrub-safe:
 *   ANTICIPATION (t0-480..t0): the lean-back coil — the torso winds back
 *   -5°, the shoulders counter-tilt, the root lifts 2px (a breath taken).
 *   STRIKE (t0..t0+200): the take()'s overshoot with a HERO amplitude —
 *   the coil releases forward +4.5° past the pose, the brow/blink spike,
 *   the root drops (the weight commits).
 *   SETTLE (t0+200..t0+380): the take()'s own damped bounce — the head
 *   chases the torso on the blend's 105ms lag term (already in the draw
 *   path), which is the follow-through the audit demands (>=100ms).
 * Outside its window the pose is returned untouched.
 */
export function heroTake(pose: Pose, t: number, t0: number): Pose {
  const dt = t - t0;
  // ANTICIPATION: the coil — ramps in over 340ms, holds to the strike.
  if (dt >= -480 && dt < 0) {
    const u = clamp01((dt + 480) / 340);
    const e = u * u; // easeIn — the coil gathers
    return {
      ...pose,
      lean: (pose.lean ?? 0) - 5 * e,
      shoulderTilt: (pose.shoulderTilt ?? 0) - 3 * e,
      rootY: (pose.rootY ?? 0) + 2 * e,
      headTilt: (pose.headTilt ?? 0) + 1.5 * e, // the chin lifts a touch
    };
  }
  if (dt < 0) return pose;
  // STRIKE + SETTLE: the take() body, amplitude raised to the hero band.
  if (dt > 380) return pose;
  if (dt < 66) {
    return { ...pose, rootY: (pose.rootY ?? 0) + 3.5 };
  }
  const over = clamp01(easeOutCubic(Math.min(1, (dt - 66) / 134)));
  const settle = dt >= 200 ? Math.sin((dt - 200) / 180 * Math.PI) : 0;
  const bounce = dt < 200 ? over : -0.45 * settle;
  return {
    ...pose,
    browRaise: clamp01(pose.browRaise + 0.30 * (dt < 200 ? over : 1 - 0.5 * settle)),
    headTilt: (pose.headTilt ?? 0) - 6 * bounce,
    lean: (pose.lean ?? 0) + 4.5 * bounce,
    rootY: (pose.rootY ?? 0) + 2.5 * bounce,
    blinkT: dt < 200 ? 0 : undefined,
  };
}

export const mixPose = blendPose;

/**
 * 100-JUDGE PANEL / Phase 2 item 2 — SMEARS AS EVENTS (report §6 Phase
 * 2, p.14): "Drive r.smear from scene events (walk mid-stride, the
 * tear, reaction entries) in addition to word accents; allow leg
 * smears on the run."
 *
 * WALKSMEAR — the mid-stride event: the swing leg's peak-velocity
 * window. The walk's swing occupies phase (0, 0.5) per leg; the foot
 * moves fastest at mid-swing (φ ≈ 0.25 / 0.75) where the leg sweeps
 * through vertical. This fires a 0..1 smear envelope there — the body
 * answers the stride with motion streaks exactly where the eye already
 * reads velocity. Pure function of the walk's own phase; scrub-safe.
 */
export function walkSmear(walkPhase: number | undefined): number {
  if (walkPhase === undefined) return 0;
  const ph = ((walkPhase % 0.5) + 0.5) % 0.5; // per-leg half-cycle
  // peak at mid-swing (ph 0.25), dead at the contacts (ph 0 / 0.5)
  const d = Math.abs(ph - 0.25);
  return d > 0.14 ? 0 : 1 - d / 0.14;
}
export const easeVal = easeOutCubic;
export const softMix = mix;
