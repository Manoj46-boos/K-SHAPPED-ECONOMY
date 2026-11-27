# Upload gates — the law (U19)

Nothing ships without all four gates green. The gates already exit
non-zero on violation; `tools/upload-gates.sh` binds them into one
pre-upload sequence and that exit is **respected, never waived**.

| # | Gate | Command | Law |
| --- | --- | --- | --- |
| 1 | Feed twin | `node tools/frame-dump.mjs --feed` | Run on EVERY visual change — the 320px twin must render error-free (the phone is the audience). |
| 2 | Novelty | `node tools/novelty-audit.mjs` | No beat's framing repeats above the repetition band. |
| 3 | Collision guard | `node tools/gate-check.mjs` | Zero new violations; the sweep is the referee on every camera/layout change. |
| 4 | Full harness | `node tools/render-check.mjs` | 40-frame harness + feed twins + every metric/scale-law/occupancy/silhouette gate. |

```sh
sh tools/upload-gates.sh   # all four, in order, stops at the first red gate
```

## After the first upload

```sh
node tools/ingest-analytics.mjs   # pull retention by timestamp
```

Fix every retention cliff of **2.5%/min** with a **prop pop** or a
**camera move** at the exact timestamp the cliff fires — then re-run the
gates before re-upload (U19, K-Shaped Economy Visual Quality Market
Review §3.4).
