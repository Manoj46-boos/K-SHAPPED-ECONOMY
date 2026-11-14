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
   *  any rig scale.
   *  100-JUDGE DOSSIER (P3 — motion contrast): 1.6 -> 0.8 — quiet scenes
   *  become genuinely still (2.1px screen at rig 2.6, under the feed's
   *  static-perception floor, so ambient ink stops shimmering); hero
   *  moments carry the film's motion through the keyed poses instead. */
  boilPx: 0.8,
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
  /** Anticipation recoil before bigText — kept (the wind-up must be felt).
   *  100-JUDGE DOSSIER (P3 — motion contrast, the deferred half): 0.06 →
   *  0.12 — the recoil is the HERO gesture's wind-up and must travel 2×
   *  the ambient register: quiet scenes sit at boil 0.8 and tripod drift
   *  0.25; the statement slam's wind-up now pulls 12% against that floor.
   *  Guard: the recoil is a 700ms transient inside the dead-still window
   *  (gt 500-1200) — punch-class, and the statement dolly that releases
   *  from it is cap-clamped in cameraV2. */
  anticipation: 0.12,
  /** Reaction-shot camera push per beat — kept (the close-ups are the
   *  film's best frames; the external audit endorsed them). */
  /** Reaction-shot camera push per beat — the DOSSIER FOLLOW-UP calibration:
   *  the shipped 0.95/1.1/0.9 amplitudes are 2.0-2.1x ZOOMS at peak — the
   *  phone-gate measured the twist close-up emptying 24% of the frame (the
   *  whole composition pushed off-frame). The panel's own numbers were
   *  0.22-0.28 ("a beat, not a hold"); these land between that and the old
   *  register: a 1.3-1.4x push that reads as a close-up while the scene's
   *  content stays IN frame. The faceScale 1.4-1.8x + DOF + veil carry the
   *  close-up read — the camera supports them, it does not replace them. */
  reactionAmp: { paradox: 0.34, fund: 0.4, three: 0.32 } as Record<string, number>,
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

/**
 * 100-JUDGE DOSSIER (P3 — THE MOTION-CONTRAST REGISTER): the principle is
 * contrast — quiet moments nearly still (boil 0.8, tripod drift 0.25,
 * dead-still statement entries), hero moments moving 2-3× MORE. The quiet
 * half shipped with the boil register; this is the hero half: the amplitudes
 * the film's loudest beats (the bigText/stampCard slams, the cold-open tear,
 * the paradox strike) drive INSTEAD of the ambient values. Nothing else in
 * the engine may hand-tune these.
 */
export const HERO = {
  /** Micro-shake amplitude on hero slams (ambient AMP.microShakePx = 6). */
  shakePx: 14,
  /** Impact-ring scale multiplier on hero slams (radius + stroke). */
  ringScale: 1.7,
  /** Statement cut-punch (ambient AMP.cutPunch = 0.03, statements 0.05). */
  punch: 0.075,
  /** Statement block overshoot: the slam text travels from 0.90 (not 0.94)
   *  to 1.10 (not 1.06) — double the arrival travel. */
  blockTravel: 0.1,
};

/** Phase 2 ink register (report §11 Phase 2): the phone feed rewards dark
 *  mass on pale ground. Limb/torso/head weights sized so the figure carries
 *  the frame's identity even at 320px. */
export const INK = {
  /** Near arm taper: shoulder → elbow → wrist.
   *  100-JUDGE REPORT fix C2 (INK MASS): 17/13/10 → 20/15/11 — the figure
   *  must carry the frame's value structure (dark ink was 2.3% of frame;
   *  the target band is 4-5%). */
  armNear: [20, 15, 11] as [number, number, number],
  /** Far arm taper (C2: 13/10/8 → 15/12/9). */
  armFar: [15, 12, 9] as [number, number, number],
  /** Near leg taper (C2: 21/16/12 → 25/19/14 — the report's number). */
  legNear: [25, 19, 14] as [number, number, number],
  /** Far leg taper (C2: 17/13/10 → 20/15/11). */
  legFar: [20, 15, 11] as [number, number, number],
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
