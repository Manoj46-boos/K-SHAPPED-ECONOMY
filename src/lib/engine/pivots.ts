/**
 * PHASE 1 (100-Judge Panel Audit §Phase 1) — the presenter's blocking +
 * pivot-take registry. Two systems, both deterministic and scrub-safe:
 *
 * 1) THE SENTENCE-BLOCKING PLAN (Phase 1.4 — "sentence blocking over
 *    sentence wobble"). The editorial host owns three stage blocks
 *    (BLOCKS in scenes-host.ts). For every sentence in the film this
 *    module pre-computes, at module load, where he stands and when he
 *    crosses: a start block, an optional list of mid-sentence reposition
 *    walks, and the block he rests on. Rules:
 *      • a boundary move happens on ~30-50% of sentence boundaries,
 *        hash-gated per sentence id (never random, never clocked);
 *      • a stay whose projected window would blow the static budget is
 *        SPLIT by mid-sentence reposition walks — a 21-second sentence
 *        gets three stage segments, not two blocks and a statue;
 *      • the host may never sit at one x for a projected ≥8.2s of
 *        speaking time, so no 10s static window can ship;
 *      • every value is a pure function of the script text — the same
 *        build always produces the same plan.
 *
 * 2) THE PIVOT-TAKE CLOCKS (Phase 1.3 — "Take() on every chapter pivot,
 *    not 3× per film"). The take() grammar (2-frame hold → 20% brow
 *    overshoot + blink + head-torso double-bounce) previously fired only
 *    at the three REACTIONS-table windows. It now also fires:
 *      • at every CHAPTER OPENER — within 600ms of the chapter card
 *        clearing (the card ends exactly when the chapter's first beat
 *        begins, so the take runs inside the opener beat's first 600ms);
 *      • at every PARADOX / rhetorical-turn sentence ("But here's…",
 *        "…paradox…", "Wait —") — the take fires ~120ms after the
 *        sentence's first word, on the sentence's own clock.
 */
import { SCRIPT } from './script-data';
import { hashStr, splitSentences } from './easing';

// ── shared duration estimator (mirrors the render harness's estWords) ───────
function estSentenceMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  let t = 0;
  for (const w of words) t += Math.min(650, 180 + w.length * 38) + 45;
  return Math.max(900, Math.round(t));
}

const SENT_GAP_MS = 340; // flat estimate of the punctuation-aware sentence gap
const STATIC_BUDGET_MS = 8200; // hard cap on any single static segment (< 10s acceptance)
const STAY_TRIGGER_MS = 6500; // a stay whose projected window exceeds this gets split
const MIN_SEG_MS = 2600; // no stage segment shorter than this (no frenetic hopping)

export interface StageMove {
  at: number; // ms into the sentence where the walk begins
  from: number; // block index the walk starts from
  idx: number; // block index the walk lands on
}

export interface BlockPlanEntry {
  startIdx: number; // block the host stands on when the sentence begins
  restIdx: number; // block he rests on when the sentence ends
  moves: StageMove[]; // mid-sentence reposition walks (0..3), in time order
}

const BLOCK_COUNT = 3;
const plan = new Map<string, BlockPlanEntry>();

interface SentenceRef {
  id: string;
  text: string;
}

/** The film's sentences in script order, with their manifest-style ids. */
const SENTENCES: SentenceRef[] = [];
SCRIPT.forEach((chapter, ci) => {
  chapter.beats.forEach((beat, bi) => {
    splitSentences(beat.vo)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text, si) => {
        SENTENCES.push({ id: `${ci}-${bi}-${si}`, text });
      });
  });
});

(function buildPlan(): void {
  const hashBlock = (id: string): number => Math.floor(hashStr(id) * BLOCK_COUNT) % BLOCK_COUNT;
  const pickAlt = (salt: string, from: number): number => {
    const p = (from + 1 + (Math.floor(hashStr(salt) * 2) % 2)) % BLOCK_COUNT;
    return p === from ? (from + 1) % BLOCK_COUNT : p;
  };

  // schedule 0..3 mid-sentence walks so every stage segment stays inside
  // the static budget. The sentence is partitioned into K+1 hash-jittered
  // parts; K is the smallest count whose mean part fits BOTH the first
  // segment's own budget (cap minus the time already spent at this block)
  // and the global cap.
  const scheduleMoves = (id: string, est: number, beforeMs: number, fromIdx: number): StageMove[] => {
    const avail1 = Math.max(MIN_SEG_MS, STATIC_BUDGET_MS - beforeMs - SENT_GAP_MS);
    let K = 0;
    while (K < 3 && est / (K + 1) > Math.min(avail1, STATIC_BUDGET_MS)) K++;
    if (K === 0) return [];
    const segs = K + 1;
    const weights: number[] = [];
    let wSum = 0;
    for (let i = 0; i < segs; i++) {
      const w = 0.75 + hashStr(id + ':seg' + i) * 0.5;
      weights.push(w);
      wSum += w;
    }
    const ats: number[] = [];
    let acc = 0;
    for (let i = 0; i < K; i++) {
      acc += (est * weights[i]) / wSum;
      ats.push(acc);
    }
    // hard clamps: the first walk must land inside the first segment's own
    // budget; every pair of walks must keep MIN_SEG on both sides
    if (ats.length) {
      ats[0] = Math.min(ats[0], avail1 - 200);
      for (let i = 1; i < ats.length; i++) {
        ats[i] = Math.min(Math.max(ats[i], ats[i - 1] + MIN_SEG_MS), est - MIN_SEG_MS * (ats.length - i));
      }
      for (let i = 0; i < ats.length; i++) {
        ats[i] = Math.round(Math.max(MIN_SEG_MS, Math.min(est - MIN_SEG_MS, ats[i])));
      }
      ats.sort((a, b) => a - b);
    }
    const moves: StageMove[] = [];
    let from = fromIdx;
    ats.forEach((at, i) => {
      const idx = pickAlt(id + ':mv' + i, from);
      moves.push({ at, from, idx });
      from = idx;
    });
    return moves;
  };

  let cur = 0;
  let staticMs = 0; // projected speaking time already spent at the current block

  SENTENCES.forEach(({ id, text }, i) => {
    const est = estSentenceMs(text);
    const gate = hashStr(id + ':blk') < 0.5;
    const target = hashBlock(id);
    let startIdx: number;
    let beforeMs: number;
    let moves: StageMove[] = [];

    if (i === 0) {
      // the film's opening sentence: the host starts on his own hash block
      startIdx = target;
      beforeMs = 0;
      staticMs = est;
    } else if (target !== cur && gate) {
      // PHASE 1.4 — the hash-gated boundary move: ~50% of boundaries
      // consider a move, ~2/3 of those actually change block ⇒ net ~33%
      // of sentence boundaries move the host (the panel's 30-50% band)
      startIdx = target;
      beforeMs = 0;
      cur = startIdx;
      staticMs = est;
    } else {
      // the boundary STAY (the 50-70% case): keep the block, but the
      // projected window (time already spent + gap + this sentence) may
      // not exceed the budget. Two rescues, in order:
      //   • mid-sentence repositions split the stay into in-budget
      //     segments (the panel's "presenter who crosses his stage");
      //   • when even a 2.6s-late first walk cannot keep the FIRST
      //     segment in budget (too much time already spent at this
      //     block), the boundary itself must move — forced, deterministic.
      startIdx = cur;
      beforeMs = staticMs;
      const projected = staticMs + SENT_GAP_MS + est;
      const canSplit = beforeMs + SENT_GAP_MS + MIN_SEG_MS <= STATIC_BUDGET_MS;
      if (projected > STAY_TRIGGER_MS && canSplit) {
        moves = scheduleMoves(id, est, beforeMs, startIdx);
        cur = moves.length ? moves[moves.length - 1].idx : startIdx;
        staticMs = moves.length ? est - moves[moves.length - 1].at : est;
      } else if (projected > STATIC_BUDGET_MS) {
        // un-splittable — the boundary itself must move
        startIdx = pickAlt(id + ':force', cur);
        beforeMs = 0;
        cur = startIdx;
        staticMs = est;
      } else {
        staticMs = projected;
      }
    }
    // an ultra-long sentence exceeds the budget ON ITS OWN — a boundary
    // move cannot save it; split it with mid-sentence repositions
    if (!moves.length && est > STATIC_BUDGET_MS) {
      moves = scheduleMoves(id, est, beforeMs, startIdx);
      cur = moves.length ? moves[moves.length - 1].idx : startIdx;
      staticMs = moves.length ? est - moves[moves.length - 1].at : est;
    }
    const restIdx = moves.length ? moves[moves.length - 1].idx : startIdx;
    plan.set(id, { startIdx, restIdx, moves });
  });
})();

/** Block index (0..2) the host starts a sentence on. -1 → caller falls back. */
export function stageStartIdx(id?: string): number {
  if (!id) return -1;
  const e = plan.get(id);
  return e ? e.startIdx : -1;
}

/** Block index (0..2) the host rests on when the sentence ends. */
export function stageRestIdx(id?: string): number {
  if (!id) return -1;
  const e = plan.get(id);
  return e ? e.restIdx : -1;
}

/** The sentence's mid-sentence reposition walks (empty when none). */
export function stageMoves(id?: string): StageMove[] {
  if (!id) return [];
  const e = plan.get(id);
  return e ? e.moves : [];
}

// ── pivot-take clocks ────────────────────────────────────────────────────────

/** sceneKeys of every chapter-opening beat (chapters that follow a card).
 *  The card's endMs IS the opener beat's startMs, so "within 600ms of the
 *  card clearing" == the opener's scene clock [0, 600ms]. */
const CHAPTER_OPENER_SCENES: Set<string> = new Set(
  SCRIPT.slice(1).map((ch) => ch.beats[0].scene.sceneKey as string)
);

/** Sentence line ids that carry a paradox / rhetorical-turn pivot. */
const PIVOT_LINES: Set<string> = new Set(
  SENTENCES.filter(({ text }) => /\bparadox/i.test(text) || /^(but\b|and yet\b|except\b|wait\b|here's\b|here is\b)/i.test(text)).map(
    ({ id }) => id
  )
);

/** Absolute group-clock start time of the pivot take for THIS frame, or -1.
 *  `delay` shifts the hold later for side hosts that fade in (their take
 *  must start once they are actually visible). Pure function of the ctx. */
export function pivotTakeStart(
  sceneKey: string,
  sentenceId: string | undefined,
  sentenceT: number | undefined,
  t: number,
  sceneT: number,
  delay = 150,
  /** P2 U14 (THE FIRST 60 SECONDS, ENGINEERED): the chapter index and the
   *  sentence duration, when the caller has them — the long-hold
   *  interrupt. Every sentence >= 2.2s in chapters 1-3 fires the take at
   *  its own start: the platform benchmark punishes any 3-5s window with
   *  no scene/camera/body event, and the micro-camera scheduler is
   *  retired (U10) — the BODY owns the pattern interrupts now. */
  chapterIdx?: number,
  sentenceDurMs?: number
): number {
  // chapter opener: the take rides the opener scene's first ~600ms.
  // sceneT (the sceneKey run clock, which never resets inside a run)
  // guards against the 12s re-split replaying the take mid-chapter.
  if (CHAPTER_OPENER_SCENES.has(sceneKey) && sceneT < 900) {
    const dt = sceneT - delay;
    if (dt >= 0 && dt <= 380) return t - dt;
  }
  // paradox / turn sentence: the take fires on the sentence's own clock,
  // 120ms after the sentence's first word (30ms earlier than the opener
  // hold so the overshoot completes inside the same 600ms envelope)
  if (sentenceId && PIVOT_LINES.has(sentenceId) && sentenceT !== undefined) {
    const dt = sentenceT - (delay - 30);
    if (dt >= 0 && dt <= 380) return t - dt;
  }
  // P2 U14: the long-hold interrupt — chapters 1-3, sentences >= 3.2s.
  // 380ms window at the sentence's start; the existing hold-overshoot-
  // settle envelope runs it (same grammar as the pivot lines, one system).
  if (
    chapterIdx !== undefined && chapterIdx <= 2 &&
    sentenceDurMs !== undefined && sentenceDurMs >= 2200 &&
    sentenceT !== undefined
  ) {
    const dt = sentenceT - (delay - 30);
    if (dt >= 0 && dt <= 380) return t - dt;
  }
  return -1;
}

/** Diagnostics for the verification harness (not consumed by the renderer). */
export function planStats(): {
  sentences: number;
  boundaries: number;
  moves: number;
  midMoves: number;
  longestStaticMs: number;
} {
  let boundaries = 0;
  let moves = 0;
  let midMoves = 0;
  let longestStaticMs = 0;
  let prevRest: number | null = null;
  let carryStatic = 0; // speaking time already spent at the block when the current sentence began
  SENTENCES.forEach(({ id, text }, i) => {
    const e = plan.get(id)!;
    const est = estSentenceMs(text);
    // the sentence's stage segments, from the walk list
    const parts: number[] = [];
    let prev = 0;
    for (const m of e.moves) {
      parts.push(m.at - prev);
      prev = m.at;
    }
    parts.push(est - prev);
    const moved = i === 0 || e.startIdx !== prevRest;
    if (i > 0) boundaries++;
    if (moved) moves++;
    midMoves += e.moves.length;
    // the first segment also carries the time already spent at this block
    const seg0 = (moved ? 0 : carryStatic + SENT_GAP_MS) + parts[0];
    longestStaticMs = Math.max(longestStaticMs, seg0);
    for (let k = 1; k < parts.length; k++) longestStaticMs = Math.max(longestStaticMs, parts[k]);
    carryStatic = parts[parts.length - 1];
    prevRest = e.restIdx;
  });
  return { sentences: SENTENCES.length, boundaries, moves, midMoves, longestStaticMs };
}
