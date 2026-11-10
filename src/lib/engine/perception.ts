/**
 * perception.ts — Phase 1 of the 100-Judge Panel blueprint (report §11).
 *
 * ONE file holds every perception-critical amplitude in the film. The audit
 * measured every life term in the engine sitting at 20-40% of the amplitude
 * at which it becomes visible on a 320px phone feed — the "amplitude
 * starvation" root cause behind all five domain scores. These values raise
 * each term to 2-3x so it clears the phone-scale floors (2px static, 5px in
 * motion), re-verified against the collision-guard sweep.
 *
 * Every value here is a NAMED decision traceable to a row of Table 7 in the
 * panel report. Nothing else in the engine may hand-tune these terms.
 */

/** The Phase 1 amplitude register (report Table 7). */
export const AMP = {
  /** Line-boil jitter per joint endpoint, px (was ±0.85 — under the 2px
   *  static floor at 320px). ±2.2 survives the 6x downscale. */
  boilPx: 2.2,
  /** Contrapposto idle weight shift, px (was ±3.0). */
  weightShift: 7.5,
  /** Shoulder counter-rotation, deg (was ±1.6). */
  shoulderCounterDeg: 4.0,
  /** Walk pelvis bob, px (was 9) — one readable bump per step. */
  walkBobPx: 16,
  /** Contact-squash depth, px (was 12) — the plant must LAND. */
  squashPx: 22,
  /** Swing-foot arc lift, px (was 9) — the arc must clear the floor. */
  swingLiftPx: 15,
  /** Toe-off pitch, deg (was +16). */
  toeUpDeg: 26,
  /** Heel-strike pitch, deg (was -14). */
  toeDownDeg: -22,
  /** Micro-shake on reveals, px (was 4.4) — impacts must register. */
  microShakePx: 9,
  /** K brand-object wobble, deg (was ±2 on a 4s period — "stately to the
   *  point of still"). ±5 on 2.6s: the object breathes. */
  kWobbleDeg: 5,
  kWobblePeriodMs: 2600,
  /** Scene push (single-subject scenes) — the FULL per-gesture travel the
   *  report regulates (0.16 of frame width = ~51px at the 320px gate).
   *  Implemented as a breathing zoom (start 0.93 → end 1.09) so the
   *  absolute end-scale stays inside the collision guard's certified
   * envelope for the shipped full-bleed layouts — the travel reads, the
   * edges survive. (A flat 1 → 1.16 push crops 16% of every margin and
   * fails the guard sweep; see director.cameraV2.) */
  scenePush: 0.16,
  /** bigText dolly (was 0.13) — slams need scale. */
  bigTextDolly: 0.22,
  /** Anticipation recoil before bigText (was 0.032) — the wind-up must be
   *  felt. */
  anticipation: 0.06,
  /** Reaction-shot camera push per beat (was 0.05-0.10). */
  reactionAmp: { paradox: 0.22, fund: 0.28, three: 0.24 } as Record<string, number>,
  /** Brow-raise travel, px (was x5) — faces must act at 320px. */
  browTravelPx: 14,
  /** Phase 5: reaction windows tighten to a beat, not a hold. */
  reactionWindowMs: 1200,
  /** Phase 5: the whip-truck on scene entry (was 40px). */
  whipPx: 90,
  /** Phase 5: hard-cut scale punch on ALL scene changes (was 0.035). */
  cutPunch: 0.05,
};

/** Phase 2 ink register (report §11 Phase 2): the phone feed rewards dark
 *  mass on pale ground. Limb/torso/head weights sized so the figure carries
 *  the frame's identity even at 320px. */
export const INK = {
  /** Near arm taper: shoulder → elbow → wrist (was 13/11/9). */
  armNear: [17, 13, 10] as [number, number, number],
  /** Far arm taper (was 9/8/7). */
  armFar: [13, 10, 8] as [number, number, number],
  /** Near leg taper (was 15/12/10). */
  legNear: [21, 16, 12] as [number, number, number],
  /** Far leg taper (was 12/10/9). */
  legFar: [17, 13, 10] as [number, number, number],
  /** Torso taper: hips → shoulders (was 15/22). */
  torso: [19, 30] as [number, number],
  /** Head outline stroke (was 9). */
  headStroke: 12,
};

/** Phase 3: the K's 3D language (report §11 Phase 3). */
export const K3D = {
  /** Extrusion depth as a fraction of letter size (was 0.14 — "a sliver,
   *  not volume"). */
  depthFrac: 0.26,
  /** The vanishing point every K stroke extrudes toward (design-space
   *  1920x1080). Parallel offsets read as a drop-shadow layer style;
   *  convergence reads as perspective. */
  vp: { x: 960, y: 300 } as { x: number; y: number },
};
