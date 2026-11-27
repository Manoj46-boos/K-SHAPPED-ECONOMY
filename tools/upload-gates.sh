#!/bin/sh
# U19 (VISUAL MARKET REVIEW §3.4 — MAKE THE UPLOAD GATES LAW)
# The non-negotiable pre-upload sequence. Every gate must PASS (exit 0);
# the script stops at the first red gate and exits non-zero — the same
# contract the tools already enforce individually, now bound as law:
#   1. frame-dump --feed  — the 320px feed twin renders error-free on
#      every visual change (the phone IS the audience).
#   2. novelty-audit      — the repetition band (no beat above the cap).
#   3. gate-check         — the collision guard + all metric/scale-law/
#      occupancy/silhouette gates. It exits non-zero on any violation;
#      that exit is respected, never waived.
#   4. render-check       — the 40-frame harness + feed twins + all gates.
# Usage: sh tools/upload-gates.sh
set -e
cd "$(dirname "$0")/.."

echo "== U19 UPLOAD GATES =="
echo "-- 1/4 feed twin (frame-dump --feed)"
node tools/frame-dump.mjs --feed
echo "-- 2/4 novelty audit"
node tools/novelty-audit.mjs
echo "-- 3/4 gate check (collision guard + all gates)"
node tools/gate-check.mjs
echo "-- 4/4 full render check (40-frame harness)"
node tools/render-check.mjs
echo "== ALL GATES GREEN — cleared for upload =="
# Post-upload (manual, per the review's law): node tools/ingest-analytics.mjs
# after the first 48h of traffic; fix every retention cliff of 2.5%/min
# with a prop pop or a camera move at the exact timestamp the cliff fires.
