# The honest 1M math — the retention loop (P2/P3, audit §4.4 U15)

## What the visuals are and are not

1M views = impressions × CTR × retention-driven recommendation. The render
engine is the **multiplier** on retention and on save/share rate — it is
**not the base**. The base is topic selection, title, and thumbnail
iteration cadence. This document states the loop plainly; it ships with
the P0–P2 visual bar because visuals at today's level cap the channel
below the loop, and visuals at the P2 bar make the loop possible.

## The loop, per upload

1. **Topic** — pick the next video against the same audience (the finance-
   explainer niche this film is built for), not against the whole platform.
2. **Thumbnail** — the system generates six variants
   (`npm run thumb:variants` → `public/thumbnail-v0..v5.png`). Use them
   **every upload**: A/B at least two variants against the same audience
   before committing spend. The variants differ in composition, prop and
   hook line — pick by measured CTR, not taste.
3. **Title** — iterate 10–20 title candidates against the same audience
   across uploads; keep the ones that earn the click AND the watch.
4. **Retention read-back** — `scripts/ingest-analytics.mjs` logs measured
   per-beat retention (the `TimelineBeat.retention` field) back from
   YouTube Studio, so the next film's beat list is tuned by data.
5. **Repeat** — 10–20 upload iterations of title/thumbnail/topic against
   the same audience is the expected path to the 1M order of magnitude.
   That cadence is the base; the P0–P2 frame bar is what keeps viewers
   once the click lands.

## Where the frame bar sits now

With P0–P2 shipped (the defect sweeps, the character re-spec, the motion
grammar, the designed rooms, the 320-gate CI, the interrupt sweep), the
package enters the **top decile of the finance-explainer niche on frames**.
Whether a video hits 1M then depends on the script's hook strength and
the upload loop above. Say it plainly: the visuals open the door; the
loop walks through it.
