/** Shared scene drawing context. */
import { BeatSpec } from './script-data';
import { window4 } from './easing';
import { AMP } from './perception';

export interface SceneCtx {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** ms since the start of this beat */
  beatT: number;
  /** ms since the start of the scene group (beats sharing sceneKey) */
  t: number;
  /** scene group duration ms */
  d: number;
  /** scene group progress 0..1 */
  p: number;
  /** current beat progress 0..1 */
  beatP: number;
  /** current beat's scene props */
  s: Record<string, any>;
  beat: BeatSpec;
  speaking: boolean;
  /** word onset times local to the beat (ms) */
  wordTimes: number[];
  /** P1-6 (report §12.6): word onset times local to the SCENE GROUP (ms) —
   *  the same onsets as wordTimes, in the g.t clock that poseAt consumes. */
  gWordTimes: number[];
  /** P1-6: the film-wide sentence currently being spoken (or last started):
   *  its manifest line id, the previous sentence's id, and ms since it began.
   *  poseAt keys the talk cycle to SENTENCES, not the wall clock. */
  sentenceId?: string;
  prevSentenceId?: string;
  sentenceT?: number;
  channelName: string;
  nextVideoTitle: string;
  /** v8: this chapter's ambient wash tone (the chapter color journey).
   *  Scenes pass this to paintBg() so a 20-minute film travels through
   *  color instead of one flat white. Optional for backward compat. */
  chapterTone?: 'up' | 'down' | 'gold' | 'neutral';
}

export type SceneDrawer = (g: SceneCtx) => void;

// ── PANEL-12 / P2-6 (report §14.6): REACTION SHOTS ───────────────────────────
// The missing emotional grammar: three held-expression beats per film — on
// the twist (c8-fund), the paradox resolve (c7-paradox) and the final
// takeaway (c9-three). The camera pushes toward the host's head zone while
// faceScale renders at 1.4 and the talk envelope pauses. Keyed by sceneKey
// (NOT type — the takeaways chapters have four groups and only the payoff
// one gets the beat).
//
// `amp` is the camera push (calibrated per scene so the collision guard's
// exact-camera pass stays clean — see the tuning notes in director.ts).
// `px/py` is the push pivot: the host's chest zone, chosen so the head
// RISES into frame while the feet stay clear of the caption band.
export interface ReactionSpec {
  atFrac: number;
  durMs: number;
  amp: number;
  px: number;
  py: number;
}
export const REACTIONS: Record<string, ReactionSpec> = {
  // BLUEPRINT Phase 1+5 (report Table 7 + §11 Phase 5): the reaction
  // register rises from the 0.05-0.10 nudge ("a nudge, not a beat") to
  // the panel's numbers — paradox 0.22, fund (the twist) 0.28, three
  // 0.24 — and the windows tighten 2000 -> 1200ms ("a beat, not a
  // hold"). The scenes reframe their content during the window (content
  // recedes while the host comes forward), so the wide reading columns
  // no longer fight the push — see the scene drawers' reaction staging.
  'c7-paradox': { atFrac: 0.3, durMs: AMP.reactionWindowMs, amp: AMP.reactionAmp.paradox, px: 350, py: 550 },
  'c8-fund': { atFrac: 0.42, durMs: AMP.reactionWindowMs, amp: AMP.reactionAmp.fund, px: 1100, py: 600 },
  'c9-three': { atFrac: 0.4, durMs: AMP.reactionWindowMs, amp: AMP.reactionAmp.three, px: 500, py: 560 },
};

/**
 * The reaction envelope 0..1 for this frame — a pure function of
 * (sceneKey, group time, group duration), so the camera push in
 * director.cameraV2 and the face/talk changes in the scene drawer key off
 * the SAME clock and can never drift apart. 320ms ease in / hold / 320ms
 * ease out; the window clamps to stay inside the group.
 */
export function reactionAt(sceneKey: string, gt: number, d: number): number {
  const spec = REACTIONS[sceneKey];
  if (!spec) return 0;
  const dur = Math.min(spec.durMs, Math.max(900, d * 0.3));
  let start = Math.max(1400, d * spec.atFrac);
  start = Math.min(start, Math.max(800, d - dur - 250));
  return window4(gt, start, start + 320, start + dur - 320, start + dur);
}
