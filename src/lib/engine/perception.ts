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
   *  static floor at 320px). ±2.2 survives the 6x downscale.
   *  AUDIT-PHASE-2: raised 2.2 -> 4.5 — crosses the drawn-ink threshold at
   *  320px (downsamples to ±1.4px, the level at which the eye reads
   *  "drawn, not vector"; was 0.66px, below threshold = puppet read). */
  boilPx: 4.5,
  /** Contrapposto idle weight shift, px (was ±3.0).
   *  AUDIT-PHASE-2: raised 7.5 -> 15 — contrapposto reads at 320px
   *  (sub-pixel motion becomes visible motion; was 1.2px at feed,
   *  now 2.4px). */
  weightShift: 15,
  /** Shoulder counter-rotation, deg (was ±1.6).
   *  AUDIT-PHASE-2: raised 4.0 -> 7.0 — shoulder line counters
   *  visibly at phone scale. */
  shoulderCounterDeg: 7.0,
  /** Walk pelvis bob, px (was 9).
   *  AUDIT-ROUND-2 (fix 12): 16 → 24 — one unmistakable bump per step;
   *  at the phone gate the old bob downsampled to ~2.7px (the static
   *  floor); 24px clears it with margin. */
  walkBobPx: 24,
  /** Contact-squash depth, px (was 12) — the plant must LAND. */
  squashPx: 22,
  /** Swing-foot arc lift, px (was 9) — the arc must clear the floor. */
  swingLiftPx: 15,
  /** Toe-off pitch, deg (was +16).
   *  AUDIT-ROUND-2 (fix 12): 26 → 40 — the shoe wedge finally has a
   *  lever arm you can see at 320px; a flat paddle reads as a snowshoe. */
  toeUpDeg: 40,
  /** Heel-strike pitch, deg (was -14).
   *  AUDIT-ROUND-2 (fix 12): -22 → -34 — the heel-strike reads. */
  toeDownDeg: -34,
  /** AUDIT-ROUND-2 (fix 12 — WALK EXTREMES): the stride swing angle, deg.
   *  26° at the editorial host's scale was a ~223px stride spread on an
   *  800px figure — 28% of body height where a readable cartoon walk wants
   *  40%+. 38° = ~41% — the stride finally reads as WALKING, not
   *  gliding (the walk-in stills were judged "a limp near-vertical
   *  glide", "legs nearly stacked under the hips"). */
  swingDeg: 38,
  /** AUDIT-ROUND-2 (fix 12): the contact absorb — pelvis sinks this many
   *  px PAST the anatomical minimum at each plant (was 4.5). 9px at the
   *  host's scale is a visible signal at the phone gate. */
  absorbPx: 9,
  /** AUDIT-ROUND-2 (fix 12): the passing pose's body stretch (was 2.5).
   *  5px tall-at-the-crossing — the counter-bob the contact/pass rhythm
   *  needs. */
  passRaisePx: 5,
  /** AUDIT-ROUND-2 (fix 12): the chin tuck INTO each plant (was 3°).
   *  Doubled — the lunge reads in the head, not just the legs. */
  chinTuckDeg: 6,
  /** AUDIT-ROUND-2 (fix 12): the shoe wedge's lever length, px (was 29).
   *  36px gives the ±40° toe roll a visible lever at any host scale. */
  shoeLeverPx: 36,
  /** Micro-shake on reveals, px (was 4.4) — impacts must register.
   *  AUDIT-PHASE-4: 9 -> 18 — reveals register as hits, not ticks; the
   *  doubled amplitude reads as impact, not camera drift. */
  microShakePx: 18,
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
  scenePush: 0.22,
  /** bigText dolly (was 0.13) — slams need scale. */
  bigTextDolly: 0.22,
  /** Anticipation recoil before bigText (was 0.032) — the wind-up must be
   *  felt. */
  anticipation: 0.06,
  /** Reaction-shot camera push per beat (was 0.05-0.10).
   *  AUDIT-PHASE-3: doubled across all three beats — paradox 0.22 -> 0.45,
   *  fund 0.28 -> 0.55, three 0.24 -> 0.50. The camera now pushes halfway
   *  to the host's head; the face reaches 30-40% of frame width during
   *  the reaction window (was ~15%). Fixes the audit's worst frame
   *  (paradoxResolve 3/10) — the "plot twist reaction does not exist"
   *  verdict. */
  reactionAmp: { paradox: 0.45, fund: 0.55, three: 0.50 } as Record<string, number>,
  /** AUDIT-ROUND-2 (fix 11): the head-yaw cap, deg — the head turns toward
   *  the pointBias the arms use (eyelines connect: C5). 14° displaces the
   *  v2 head ~10px at host scale about the neck — a turn the phone gate
   *  reads, on TOP of the pupils' 7px look travel. */
  headYawDeg: 14,
  /** Brow-raise travel, px (was x5) — faces must act at 320px. */
  browTravelPx: 14,
  /** Phase 5: reaction windows tighten to a beat, not a hold. */
  reactionWindowMs: 1200,
  /** Phase 5: the whip-truck on scene entry (was 40px). */
  whipPx: 90,
  /** Phase 5: hard-cut scale punch on ALL scene changes (was 0.035).
   *  AUDIT-PHASE-4: 0.05 -> 0.08 — hard cuts land with weight; scene
   *  changes feel intentional, not accidental. */
  cutPunch: 0.08,
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
  /** Head outline stroke (was 9). AUDIT-PHASE-2: 12 -> 14 — the face's
   *  outline carries the head's identity at 320px (was 2.4px at feed,
   *  now 2.8px). */
  headStroke: 14,
};

/** Phase 3: the K's 3D language (report §11 Phase 3).
 *  AUDIT-PHASE-4: depthFrac 0.26 -> 0.40 — the extrusion becomes visibly
 *  deep, not hinted. The audit verdict was "a flat decal with offset
 *  shadows"; 40% of a 210px K is an 84px wall at 1080p (vs 55px before).
 *  AUDIT-ROUND-2 (fix 16 — ONE EXTRUSION AXIS): the vanishing-point
 *  convergence is REPLACED by a single fixed depth vector (down-left,
 *  30° off the horizontal). Per-stroke convergence was mathematically
 *  true perspective and perceptually a defect — the trained eye read
 *  "the stem's depth face offsets left, the upper diagonal's flips
 *  right... two flat letters glued at different offsets". ONE axis for
 *  all three strokes: solidity first, perspective second. */
export const K3D = {
  /** Extrusion depth as a fraction of letter size (was 0.14 — "a sliver,
   *  not volume"). */
  depthFrac: 0.40,
  /** AUDIT-ROUND-2 (fix 16): THE fixed extrusion axis — 30° below the
   *  horizontal, pointing down-left (away from the film's upper-right
   *  light). Every stroke's walls run along this ONE vector; the upper
   * arm's depth is foreshortened 12% (it sits "higher" in the oblique
   *  projection). Replaces `vp` — per-stroke VP convergence is dead. */
  axisDeg: 30,
};
