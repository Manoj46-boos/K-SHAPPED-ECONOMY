/**
 * The Host — a premium stick man presenter.
 * Skeletal rig (pelvis → spine → head, two 2-segment arms, two 2-segment legs),
 * pose blending, deterministic gestures (safe for frame scrubbing), walk cycles,
 * breathing, blinking, brow expressions, and a signature gold scarf.
 */

import { clamp01, drift, easeOutCubic, hash01, hashStr, lerp, mix, springTo } from './easing';
import { PALETTE, rgba } from './theme';
import { AMP } from './perception';

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
   *  extended). Default = auto by rig scale (fan / mitten).
   *  100-JUDGE PANEL / Phase 1 item 5 — HAND VOCABULARY (report §6
   *  Phase 1): 'palm' joins the union — the presenting hand. "Point-
   *  with-gaze, palm-open present, count with eye contact on numerals.
   *  Hands stop being mitts in every non-hero frame." The palm renders
   *  as an open hand addressing the audience; distinct from the count
   *  glyphs and the pointing index. */
  lHand?: 'fist' | 'count1' | 'count2' | 'count3' | 'palm';
  rHand?: 'fist' | 'count1' | 'count2' | 'count3' | 'palm';
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
  lLU: -4, lLL: 0, rLU: 4, rLL: 0,
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
  idle: { ...base(), lean: 6, pelvisTilt: 9, shoulderTilt: -5, lLU: -10, lLL: 4, rLU: 12, rLL: 8, lAU: -12, lAL: -8, rAU: 14, rAL: 8 },
  talkA: { ...base(), lAU: -14, lAL: -10, rAU: 26, rAL: 34, smile: 0.3, lean: 2, lLU: -7, rLU: 9, rLL: 5 },
  talkB: { ...base(), rAU: 30, rAL: 66, lAU: -10, lAL: -8, smile: 0.25, lean: -1.5, lLU: -8, lLL: 4, rLU: 6 },
  talkC: { ...base(), lAU: -20, lAL: -28, rAU: 54, rAL: 70, smile: 0.3, lean: 3, lLU: -8, rLU: 9, rLL: 6 },
  pointR: { ...base(), rAU: 78, rAL: 96, lAU: -8, lAL: -6, headTilt: -3, lean: 3, lLU: -8, rLU: 9, rLL: 5 },
  pointL: { ...base(), lAU: -78, lAL: -96, rAU: 8, rAL: 6, headTilt: 3, lean: -2, lLU: -7, rLU: 9, rLL: 5 },
  present: { ...base(), lAU: -26, lAL: -32, rAU: 54, rAL: 76, smile: 0.5, lean: 2, lLU: -8, rLU: 9, rLL: 6, rHand: 'palm' }, // Phase 1 item 5: palm-open present
  think: { ...base(), rAU: 14, rAL: 150, lAU: -14, lAL: -10, headTilt: 5, browRaise: 0.35 },
  shrug: { ...base(), lAU: -66, lAL: -132, rAU: 68, rAL: 128, headTilt: 6, browRaise: 0.6, smile: 0.15 },
  wave: { ...base(), rAU: 104, rAL: 152, lAU: -8, lAL: -6, smile: 0.7, browRaise: 0.4 },
  count1: { ...base(), lAU: -96, lAL: -110, rAU: 10, rAL: 8, headTilt: -2, lHand: 'count1' },
  count2: { ...base(), lAU: -96, lAL: -110, rAU: 104, rAL: 120, headTilt: -2, lHand: 'count2' },
  count3: { ...base(), lAU: -96, lAL: -110, rAU: 104, rAL: 120, headTilt: -2, smile: 0.4, lHand: 'count3' },
  climb: { ...base(), lAU: -104, lAL: -128, rAU: 134, rAL: 156, lLU: -22, lLL: -52, rLU: 24, rLL: 54, lean: 10, browRaise: 0.3, smile: 0.3 },
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
  heroPoint: { ...base(), lean: 9, headTilt: -5, lAU: -58, lAL: 118, rAU: 96, rAL: 118, browRaise: 0.4, smile: 0.45 },
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
  leanOnK: { ...base(), lean: 10, headTilt: -4, lLU: -9, lLL: 6, rLU: 11, rLL: -7, lAU: -20, lAL: -26, rAU: 84, rAL: 102, browRaise: 0.25, smile: 0.5 },
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
  shock: { ...base(), lean: -6, headTilt: -6, rootY: 3, lAU: -104, lAL: -128, rAU: 118, rAL: 142, lLU: -11, lLL: 4, rLU: 12, rLL: -8, browRaise: 0.95, smile: 0.02, pelvisTilt: 4.5, shoulderTilt: -3.5, shoulderDrop: 6, eyeL: 1.3, eyeR: 1.3 },
  // wry: the paradox resolve (c7-paradox) — the knowing half-smile: one brow
  // up, one down, head tilted, hand low like “well, actually”.
  // P1-4: + silhouette terms — the near eye squints to 0.55 while the far
  // opens 1.12 (the squint-smirk reads at 320px where brow values die)
  // and the near shoulder drops 4.5px (the slouch).
  wry: { ...base(), lean: 5, headTilt: 7, lAU: -16, lAL: -12, rAU: 38, rAL: 96, lLU: -8, rLU: 9, rLL: 5, browRaise: 0.62, browAngle: -10, smile: 0.45, pelvisTilt: 3.2, shoulderTilt: -2.6, eyeL: 0.55, eyeR: 1.12, shoulderDrop: 4.5 },
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
  sitBack: { ...base(), rootY: 58, lean: 8, headTilt: 4, lLU: 82, lLL: 6, rLU: 86, rLL: 10, lAU: -20, lAL: -36, rAU: 26, rAL: 30, smile: 0.3, browRaise: 0.2, pelvisTilt: 2, shoulderTilt: -1.5 },
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
        const anti = st < 150 ? Math.sin((st / 150) * Math.PI) * 0.45 : 0;
        const sT = Math.max(0, st - 150);
        const fUp = Math.max(0, springTo(0, 1, sT, 150, 11) - anti);
        // AUDIT-ROUND-2 (fix 14): elbow cascade 70 → 90ms behind the
        // shoulder — a wave that visibly travels DOWN the limb at phone
        // scale (70ms downsampled to a snap at 320px).
        const fLo = Math.max(0, springTo(0, 1, Math.max(0, sT - 90), 150, 11) - anti * 0.7);
        const up = blendPose(prevPose, cyc, fUp);
        const lo = blendPose(prevPose, cyc, fLo);
        pose = { ...up, lAL: lo.lAL, rAL: lo.rAL };
        // beat-accent: a decaying forearm pulse on each word onset — the
        // hand strikes on the emphasized word, exactly as a narrator's does
        let accent = 0;
        if (opts.wordTimes) {
          for (const wt of opts.wordTimes) {
            if (t >= wt && t < wt + 300) {
              accent = Math.max(accent, Math.sin(((t - wt) / 300) * Math.PI));
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
          rAL: pose.rAL + accent * 44 + arc * 20,
          lAU: pose.lAU - accent * 26 - arc * 14,
          lean: pose.lean + (accent * 2 + arc * 1.2),
          headTilt: pose.headTilt - accent * 1.6,
          shoulderTilt: (pose.shoulderTilt ?? 0) + accent * 6,
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
    // the torso. A one-pole lag in closed form is a phase-shifted lookup:
    // the head's tilt picks up a transient proportional to how far the
    // CURRENT lean has traveled from its lagged (mostly-static) value —
    // so when the torso leans, the head arrives ~120ms later. This is the
    // last joint that still moved like a mannequin.
    const leanLagged = leaned.lean * 0.82 + 0.18 * (POSES[gesture]?.lean ?? 0);
    return {
      ...leaned,
      headTilt: leaned.headTilt + (leaned.lean - leanLagged) * 0.6,
    };
  }

  /** walk-cycle pose: phase 0..1 one full stride pair
   *  PANEL-12 / P1-5 (report §13.5): WALK ASYMMETRY + ARM LAG.
   *  (1) The right leg runs +0.03 of phase behind the left and at 92%
   *  swing amplitude - human gait is never symmetric.
   *  (2) The arms evaluate the stride 0.05 of phase BEHIND the legs.
   *  AUDIT-2 / 1.5 (report §10.2, M5): WALK 2.0 - swing-foot arcs.
   *  AUDIT-3 / §2.6 (report Phase 2.6): WALK 3.0 - trapezoid entrance,
   *  amplified counter-swing with elbow flexion, contact bob/squash,
   *  heel-strike->toe-off shoe pitch.
   *  BLUEPRINT (report §11, Phases 1+2) - WALK 4.0:
   *  (8) ANATOMIC PHASING - leg angles keyed to -cos(2*pi*phi): the
   *      stride is WIDEST at each contact and the legs cross at passing.
   *      The old sin keying spread the legs at mid-swing, so the stride
   *      happened BETWEEN the contacts - the "mannequin slid along a
   *      rail" read at its root.
   *  (9) GROUND-ANCHORED PELVIS - rootY is the stance leg's vertical
   *      reach (analytic, exact, scrub-safe): the body is LOW at contact
   *      (spread legs) and TALL at passing, and the planted foot stays on
   *      the ground line BY CONSTRUCTION. The bob fudge terms are gone.
   *  (10) PELVIS TILT +/-4.5 deg + SHOULDER COUNTER +/-3.5 deg (Phase 2's
   *      two missing rotation terms) - hips and shoulders counter-rotate
   *      through the stride; the walk finally has a torso opinion.
   *  Amplitudes come from perception.ts (AMP): swing lift 15px, toe pitch
   *  +26/-22 deg rolling the Phase-2 wedge shoe. */
  static walkPose(phase: number, speed = 1): Pose {
    const ph = ((phase % 1) + 1) % 1;
    const s = Math.sin(ph * Math.PI * 2);
    const c = Math.cos(ph * Math.PI * 2);
    const phR = ph - 0.03;                          // right leg's 0.03 lag
    const cR = Math.cos((ph - 0.47) * Math.PI * 2); // right leg's swing key
    const sR = Math.sin((ph - 0.47) * Math.PI * 2) * 0.92;
    const cA = Math.cos((ph - 0.05) * Math.PI * 2); // arms lag legs 0.05
    const sA = Math.sin((ph - 0.05) * Math.PI * 2);
    // AUDIT-ROUND-2 (fix 12 — WALK EXTREMES): swing 26 → 38° (AMP.swingDeg).
    // The old stride spread ~28% of body height; a readable cartoon walk
    // wants 40%+. The math stays exact — feet still plant, pelvis still
    // ground-anchored; only the caricature amplitude changes.
    const swing = AMP.swingDeg * speed;
    // (9) strike pulses fire AT each foot's contact: LEFT lands at
    // phi=0.5 (its swing window is (0, 0.5)); RIGHT at phi~=0.97 (its
    // 0.47-lagged swing ends). ~0.1 phase wide, squared.
    const strikeL = Math.pow(Math.max(0, (-c - 0.86) / 0.14), 2);
    const strikeR = Math.pow(Math.max(0, (-cR * 0.92 - 0.86) / 0.14), 2);
    // swing arcs (AMP.swingLiftPx): zero at the contacts, peak mid-swing
    const liftL = Math.max(0, s) * AMP.swingLiftPx * speed;
    const liftR = Math.max(0, Math.sin((ph - 0.47) * Math.PI * 2)) * AMP.swingLiftPx * speed;
    // (8) anatomically phased legs: the swing leg sweeps back(-A) ->
    // vertical -> forward(+A); stance mirrors. Knees: swing clearance
    // mid-swing (22 deg), absorption at contact (16 deg) - both shorten
    // the leg, which the pelvis anchor turns into visible drop.
    const lLU = -c * swing - 3;
    const rLU = -cR * swing * 0.92 + 3;
    const lLL = lLU - Math.max(0, s) * 22 * speed - strikeL * 16;
    const rLL = rLU - Math.max(0, sR) * 22 * speed - strikeR * 16;
    // (9) GROUND-ANCHORED pelvis: rootY = (U+L) - max vertical reach of
    // the two legs (v2 rig lengths - the walk renders through v2). The
    // stance leg defines the height; the swing lift removes the swinging
    // leg from contention. Pure function of the pose's own angles.
    const U = 54, L = 50; // PLAYBOOK P1: matches the v2 rig (5.1 heads)
    const reachL = Math.cos(lLU * D2R) * U + Math.cos(lLL * D2R) * L - liftL;
    const reachR = Math.cos(rLU * D2R) * U + Math.cos(rLL * D2R) * L - liftR;
    const rootY = (U + L) - Math.max(reachL, reachR);
    // (10) the rig terms - hips and shoulders counter-rotate (Phase 2)
    const pelvisTilt = Math.sin(ph * Math.PI * 2 + Math.PI / 2) * 4.5 * speed;
    const shoulderTilt = -Math.sin(ph * Math.PI * 2 + Math.PI / 2) * 3.5 * speed;
    // (7) the foot roll, AMP register: +26 toe-off -> -22 heel-strike
    // during swing; settles flat in stance, rises to the next toe-off.
    const toeFor = (p: number): number => {
      const sp = ((p % 1) + 1) % 1;
      if (sp < 0.5) {
        return AMP.toeUpDeg - (AMP.toeUpDeg - AMP.toeDownDeg) * (sp * 2);
      }
      const u = (sp - 0.5) * 2;
      const settle = AMP.toeDownDeg * 0.7;
      return u < 0.2 ? settle * (1 - u / 0.2) : settle + (AMP.toeUpDeg - settle) * ((u - 0.2) / 0.8);
    };
    const toeL = toeFor(ph);        // left swings (0, 0.5)
    const toeR = toeFor(ph + 0.53); // right swings (0.47, 0.97)
    // (5) amplified counter-swing + forward-swing elbow flexion - arm
    // angles oppose the same-side leg (re-phased with the legs)
    const armAmp = 0.95;
    const lAUw = -cA * swing * armAmp - 7 + sA * 3;
    const rAUw = cA * swing * armAmp + 7 - sA * 3;
    // P1-5 (100-judge audit, Table 3 — WALK EXTREMES): four caricatured
    // keyframes layered ON the analytic cycle — contact / down / pass /
    // up. The audit: "your cycle interpolates one continuous function, so
    // every frame is average; no frame is an extreme, and the eye reads
    // the average as a puppet mid-glide." The math stays exact (feet
    // never slide, the pelvis stays analytic); the EXAGGERATION is an
    // additive layer keyed to the four beats:
    //   CONTACT (φ 0.50 L / 0.97 R): the strikes — the chin tucks 3° INTO
    //     the plant (the lunge reads in the head, not just the legs);
    //   DOWN (contact +0.07): the absorb — the pelvis sinks a further
    //     4.5px PAST the anatomical minimum and the lean settles +2°;
    //   PASS (φ 0.25 / 0.75): the crossings — the body stretches TALL
    //     (rootY −2.5px) and the chin lifts 2° (the counter-bob);
    //   UP (contact −0.06): the push-off — toe extension +8° past the
    //     roll and the chin lifts ahead of the strike.
    const pulse = (center: number, width: number): number => {
      let d = Math.abs(ph - center);
      d = Math.min(d, 1 - d);
      return d > width ? 0 : 1 - d / width;
    };
    // PLAYBOOK M1 (report §8.2 — KEYED EXTREMES, NOT FUNCTIONS): the
    // additive-sine cycle was the panel's 4/10 ("no frame is an extreme;
    // the eye reads the average as a puppet mid-glide"). The four
    // classical keys now become POSE DESTINATIONS the analytic cycle
    // drives TOWARD, in addition to the ripple terms:
    //   CONTACT — the deepest lunge: the STRIDE ITSELF widens at the
    //     plant (the leg angles separate further for a beat), the pelvis
    //     drops PAST the anatomical floor, the chin tucks hard;
    //   DOWN    — the absorb: pelvis at its lowest, weight collapses
    //     onto the planted leg (absorb, kept);
    //   PASS    — the tall crossing: pelvis RISES, the swing knee drives
    //     HIGH (a caricatured knee lift, not a clearance term), the
    //     torso STRETCHES (rootY up, already keyed);
    //   UP      — the push-off: the trailing toe flicks to full extension
    //     and the chin lifts ahead of the next contact.
    // Every term remains a pure function of ph; the ground-anchor math
    // below is untouched (feet still plant, pelvis still analytic — the
    // key amplitudes are additive on TOP of the anchored solution).
    const contactL = Math.pow(pulse(0.5, 0.10), 1.5);   // left plants at φ=0.5
    const contactR = Math.pow(pulse(0.97, 0.10), 1.5);  // right plants at φ=0.97
    const passTallL = Math.pow(pulse(0.25, 0.11), 1.5); // left's pass
    const passTallR = Math.pow(pulse(0.75, 0.11), 1.5); // right's pass
    // CONTACT: the stride separates harder for the key instant — the
    // lunge reads as a lunge. The PLANTING leg drives further forward,
    // the trailing leg further back (+13° spread for ~0.2 phase). At
    // φ=0.5 the LEFT leg is forward (lLU>0); at φ=0.97 the RIGHT is.
    const spread = (contactL - contactR) * 13 * speed;
    const lLUk = lLU + spread;
    const rLUk = rLU - spread;
    // PASS: the swing knee drives HIGH — a visible knee lift at each
    // crossing (the "tall-at-passing" caricature; 20° for ~0.2 phase).
    const lLLk = lLL - passTallL * 20 * speed;
    const rLLk = rLL - passTallR * 20 * speed;
    // UP: the trailing toe flicks to full extension through push-off
    // (rides the existing pushL/pushR pulses — the flick is the visible
    // lever at the TOP of the push).
    const absorb = Math.pow(pulse(0.57, 0.07), 2) + Math.pow(pulse(0.04, 0.07), 2);
    const passP = pulse(0.25, 0.09) + pulse(0.75, 0.09);
    const pushL = Math.pow(pulse(0.43, 0.06), 2);
    const pushR = Math.pow(pulse(0.9, 0.06), 2);
    // AUDIT-ROUND-2 (fix 12): absorb 4.5 → 9px (AMP.absorbPx), pass raise
    // 2.5 → 5px (AMP.passRaisePx), chin tuck 3 → 6° (AMP.chinTuckDeg) —
    // every caricature term doubled to clear the phone gate.
    // PLAYBOOK M1: the key amplitudes ride the same registers — contact
    // drops the pelvis a further 6px into the plant (the lunge LANDS),
    // pass raises it 5px (the tall crossing), and the chin tuck doubles
    // at the contact keys (the lunge reads in the HEAD, not just legs).
    const contactK = contactL + contactR;
    return {
      ...base(),
      rootY: rootY + absorb * AMP.absorbPx + contactK * 6 - (passP * AMP.passRaisePx + (passTallL + passTallR) * 5),
      lean: 4 + s * 2 + (strikeL + strikeR) * 3 + 3 - c * 2 + absorb * 2,
      headTilt: -(strikeL + strikeR) * AMP.chinTuckDeg - contactK * AMP.chinTuckDeg + passP * 2 + (pushL + pushR) * 2.5,
      lLU: lLUk, lLL: lLLk, rLU: rLUk, rLL: rLLk,
      lAU: lAUw,
      lAL: lAUw + Math.max(0, -cA) * 24 - 2,
      rAU: rAUw,
      rAL: rAUw + Math.max(0, cA) * 24 + 2,
      smile: 0.35,
      browRaise: 0.1,
      lLift: liftL,
      rLift: liftR,
      lToe: toeL + pushL * 8 + pushR * 14,
      rToe: toeR + pushR * 8 + pushL * 14,
      pelvisTilt,
      shoulderTilt,
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
  rigScale = 1
): { x: number; pose: Pose; walking: boolean; phase: number } {
  const p = dur > 0 ? clamp01(t / dur) : 1;
  const e = walkEase(p);
  const x = lerp(from, to, e);
  const walking = p < 0.995;
  const speed = 1.15;
  // phase advances with EASED DISTANCE, not time — feet plant, never slide.
  // stridePx = ground distance per full stride pair (2 steps) at rig speed,
  // expressed in SCREEN px (× rigScale) so the plant is exact at any scale.
  const stridePx = 170 * speed * Math.max(0.1, rigScale);
  const phase = ((to - from) * e) / stridePx;
  let pose: Pose;
  if (walking) {
    pose = Stickman.walkPose(phase, speed);
    // PREMIUM UPGRADE M1: WALK ACCELERATION LEAN. The torso leans forward
    // +8° during the first 22% of the walk (acceleration), returns to neutral
    // in the cruise, and leans back -4° in the last 22% (deceleration). A
    // heavy walk leans into its acceleration and resists its deceleration —
    // the old flat lean read as gliding, not walking.
    if (p < 0.22) {
      pose = { ...pose, lean: pose.lean + 8 * (1 - p / 0.22) };
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
        rootY: settled.rootY + Math.sin(Math.min(1, kb) * Math.PI) * 3,
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
 * Scrub-safe. */
export function accentPulse(t: number, wordTimes: number[]): number {
  let p = 0;
  for (const wt of wordTimes) {
    // fire in the 40-220ms strike window after the word fires
    // PREMIUM UPGRADE FIX 7 (100-judge critique §5.2): window 60-160 → 40-220ms
    // so the smear covers the full ballistic phase at the new gesture amplitude.
    if (t >= wt + 40 && t < wt + 220) {
      p = Math.max(p, Math.sin(((t - wt - 40) / 180) * Math.PI));
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
