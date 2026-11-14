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

/** The Phase 1 amplitude register (report Table 7).
 *  AUDIT-ROUND-3 (the external panel audit, Fix 3 — THE QUIET-HANDS
 *  REGISTER): ten internal rounds ratcheted every ambient amplitude 2-3x
 *  past its register (boil 2.2->4.5, toe roll 74 deg total, 18px shake,
 *  8% punch on every cut). Rendered frames read as over-animation noise
 *  around under-animated poses: "loud where it should be quiet and
 *  neutral where it should be extreme." The caricature now lives in the
 *  WALK KEY TABLE and pose extremes (stickman.ts WALK_KEYS); every
 *  ambient system returns to the perceptual floor. */
export const AMP = {
  /** Line-boil jitter per joint endpoint, LOCAL px.
   *  AUDIT-ROUND-3: 4.5 -> 1.6 — at rig 2.6 the old value displaced every
   *  joint +/-11.7px of SCREEN wobble at 10Hz: a shiver, not drawn ink.
   *  1.6 local x 2.6 rig = 4.2px screen: alive at the 320px gate, calm at
   *  1080p. stickman-v2 boilOff() additionally caps this to 4px SCREEN at
   *  any rig scale. */
  boilPx: 1.6,
  /** Contrapposto idle weight shift, px.
   *  AUDIT-ROUND-3: 15 -> 8 — the hip settle reads without the sway of a
   *  boat. */
  weightShift: 8,
  /** Shoulder counter-rotation, deg.
   *  AUDIT-ROUND-3: 7.0 -> 4.5 — a counter-line, not a shrug. */
  shoulderCounterDeg: 4.5,
  /** Walk pelvis bob, px (informational — the keyed walk derives its bob
   *  from the pose keys themselves; see stickman.ts WALK_KEYS).
   *  AUDIT-ROUND-3: 24 -> 14. */
  walkBobPx: 14,
  /** Contact-squash depth, px.
   *  AUDIT-ROUND-3: 22 -> 12 — the plant lands; the trampoline retires. */
  squashPx: 12,
  /** Swing-foot arc lift, px — the keyed walk carries its own lift values
   *  (WALK_KEYS lift column); kept for any analytic callers.
   *  AUDIT-ROUND-3: 15 -> 11. */
  swingLiftPx: 11,
  /** Toe-off pitch, deg (Pose convention: positive = toe down / toe-off).
   *  AUDIT-ROUND-3: 40 -> 22 — with the keyed roll table the shoe swings
   *  38 deg total (+22/-16): feet ROLL; 74 deg read as flippers. */
  toeUpDeg: 22,
  /** Heel-strike pitch, deg (negative = toe up / heel-strike).
   *  AUDIT-ROUND-3: -34 -> -16. */
  toeDownDeg: -16,
  /** Stride caricature, deg — KEPT (the one raise the external audit
   *  endorsed: "the stride caricature was right - keep it"). */
  swingDeg: 55,
  /** Contact absorb, px (legacy walk pulses; the keyed walk owns its own).
   *  AUDIT-ROUND-3: 18 -> 9. */
  absorbPx: 9,
  /** Passing stretch, px.
   *  AUDIT-ROUND-3: 10 -> 5. */
  passRaisePx: 5,
  /** Chin tuck into each plant, deg.
   *  AUDIT-ROUND-3: 10 -> 6. */
  chinTuckDeg: 6,
  /** The shoe wedge's lever length, px. AUDIT-ROUND-3: 36 -> 30 with the
   *  calmer roll range. */
  shoeLeverPx: 30,
  /** Micro-shake on reveals, px.
   *  AUDIT-ROUND-3: 18 -> 6 — a hit registers; an earthquake annoys. */
  microShakePx: 6,
  /** K brand-object wobble, deg.
   *  AUDIT-ROUND-3: 5 -> 3 — the object breathes; it does not sway. */
  kWobbleDeg: 3,
  kWobblePeriodMs: 2600,
  /** Scene push (single-subject scenes) — breathing zoom travel.
   *  AUDIT-ROUND-3: 0.34 -> 0.22 — the camera settles between gestures;
   *  constant breathing read as drift. */
  scenePush: 0.22,
  /** bigText dolly.
   *  AUDIT-ROUND-3: 0.34 -> 0.24 — slams keep scale; statements stop
   *  hyperventilating. */
  bigTextDolly: 0.24,
  /** Anticipation recoil before bigText — kept (the wind-up must be felt). */
  anticipation: 0.06,
  /** Reaction-shot camera push per beat — kept (the close-ups are the
   *  film's best frames; the external audit endorsed them). */
  reactionAmp: { paradox: 0.95, fund: 1.1, three: 0.9 } as Record<string, number>,
  /** The head-yaw cap, deg. */
  headYawDeg: 14,
  /** Brow-raise travel, px. */
  browTravelPx: 14,
  /** Reaction window, ms. */
  reactionWindowMs: 1600,
  /** The whip-truck on scene entry.
   *  AUDIT-ROUND-3: 90 -> 40 — an operator settles the frame; it should
   *  not sting on every entrance. */
  whipPx: 40,
  /** Hard-cut scale punch on scene changes.
   *  AUDIT-ROUND-3: 0.08 -> 0.03 — cuts land with weight at 3%; at 8%
   *  every cut popped. */
  cutPunch: 0.03,
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
