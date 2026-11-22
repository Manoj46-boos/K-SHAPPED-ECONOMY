#!/bin/bash
# U12 (market review Table 5 — fast-start delivery): the post-render shell
# step. The encoder lands moov at the end by design (in-memory fastStart
# would buffer the whole film in RAM); this stream-copy remux moves moov to
# the head in seconds at no RAM cost. Run it after every render:
#   ./scripts/remux-faststart.sh out/film.mp4
set -euo pipefail
IN="${1:?usage: remux-faststart.sh <in.mp4> [out.mp4]}"
OUT="${2:-${IN%.mp4}-faststart.mp4}"
ffmpeg -y -i "$IN" -c copy -movflags +faststart "$OUT"
# verify: moov must be in the first kilobyte
python3 - "$OUT" <<'EOF'
import sys
head = open(sys.argv[1], 'rb').read(1024)
print('moov-at-head:', b'moov' in head)
EOF