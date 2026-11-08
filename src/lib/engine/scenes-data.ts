/**
 * Data scenes: chart pairs, the big annotated journey chart, pies, dot grids,
 * Mag-7 chips, comparison bars, trio convergence, K definition, gas pump,
 * recession gauge, AI datacenter, stat cards, owner-vs-worker, fund split,
 * odds spread.
 */

import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp } from './easing';
import { PALETTE, TONE, card, chip, chipWidth, rgba, roundRect, setFont, paintBg, glowBlob, CAPTION_ZONE_TOP, TYPE_FLOOR } from './theme';
import { bokehField, kMotifs, lightRays, drawK, drawK3D, floatCoins, sparkles } from './effects';
import { SceneCtx } from './scene-context';
import { lineChart, pieChart, barRow, dotGrid, gauge, statCard, sourceTag, sceneTitle, wrapText } from './charts';
import { Stickman, POSES, blendPose } from './stickman';
import { drawStickmanV2, talkAt } from './stickman-v2';
import { registerRect } from './collision';

function bg(g: SceneCtx, seed: number, gold = 0.4): void {
  paintBg(g.ctx, g.W, g.H, g.t, g.chapterTone);
  bokehField(g.ctx, g.W, g.H, g.t, { intensity: 0.75, seed, gold });
  lightRays(g.ctx, g.W, g.H, g.t, { alpha: 0.45 });
  kMotifs(g.ctx, g.W, g.H, g.t, 0.04);
}

function hostSmall(
  g: SceneCtx, x: number, gesture = 'present', seed = 3,
  // v9 (report D-02): default ground H*0.86 → H*0.68 — the side hosts'
  // feet+shadows (to y≈985) sat inside the caption pill band on every
  // wide-pill frame (caught by the P0-1 guard sweep at pie/dot/bars/pump/
  // gauge/AI/odds scenes). Same stage line as the editorial hosts, with
  // worst-case camera margin.
  // P1-1 (report): +30% (0.84 → 1.09); ground H*0.68 → H*0.66 — envelope
  // bottom 713+39 = 752, clear of the worst-case 2-row pill envelope (776)
  // by 24px. All hostSmall call sites inherit the bump.
  groundY = g.H * 0.66, scale = 1.09
): void {
  const pose = Stickman.poseAt(g.t, { gesture, speaking: g.speaking });
  const talk = g.speaking ? talkAt(g.beatT, g.wordTimes) : 0;
  drawStickmanV2(g.ctx, x, groundY, scale, g.t, { pose, alpha: clamp01((g.t - 500) / 500), look: g.W / 2 > x ? 0.5 : -0.5, talk }, seed);
}

// ── chartTwin: S&P + Nasdaq mini charts ─────────────────────────────────────
export function chartTwinScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 61);
  const cw = W * 0.38;
  // PANEL-9 R2c (bottom-band clearance): the v8 stack put the per-chart
  // badges at y≈816 and the extraBadge card at y 886-978 — INSIDE the
  // karaoke caption zone (opaque pill, top ≈ 796 for two rows), so the
  // caption sliced through "+24% · Nasdaq-100 · 12 months", and the
  // left-anchored badges collided with the "12 mo ago" x-labels. New
  // stack: the punchline stat moves to a chip in the (previously dead)
  // top band, the per-chart badges sit in each card's title row, and the
  // plots end at y≈689 with x-labels at y≈722 — everything clears the
  // caption zone by ~30px.
  const ch = H * 0.36;
  const cy = H * 0.305;
  const charts = (s.charts as any[]) || [];
  charts.slice(0, 2).forEach((c, i) => {
    const x = W * 0.08 + i * (cw + W * 0.08);
    const ap = clamp01((t - i * 260) / 650);
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.translate(0, (1 - easeOutCubic(ap)) * 36);
    card(ctx, x, cy - 66, cw, ch + 104, { r: 30 });
    setFont(ctx, 30, 600);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'left';
    ctx.fillText(c.title, x + 36, cy - 16);
    // badge — title row, right-anchored (R2c: was bottom-left at y≈816,
    // colliding with the "12 mo ago" x-label; same visual band as the
    // title so the headline stat reads at the card's top edge)
    // v9 (report D-04): the badge now matches its chart's tone — S&P teal,
    // Nasdaq gold — so the outperformance is color-encoded, not just numbered.
    setFont(ctx, 40, 700);
    ctx.fillStyle = TONE(i === 0 ? 'up' : 'gold').main;
    ctx.textAlign = 'right';
    ctx.fillText(c.badge, x + cw - 36, cy - 10);
    ctx.textAlign = 'left';
    ctx.restore();
    lineChart(ctx, {
      x: x + 40, y: cy + 30, w: cw - 80, h: ch - 60,
      // v9 (report D-04): both series hard-coded tone 'up' — the twin
      // charts rendered in IDENTICAL teal and the 3.6-point Nasdaq
      // outperformance was invisible ("both charts look like the same
      // chart"). S&P stays teal; Nasdaq — the star of the beat — renders
      // in display gold so the eye reads winner vs baseline instantly.
      series: [{ name: '', tone: i === 0 ? 'up' : 'gold', points: c.points }],
      p: clamp01((t - 200 - i * 260) / 2400),
      t,
      yFormat: 'idx100', showYAxis: true, gridLines: 3,
      // PANEL-9 R2: twin charts shipped axis-less — "illustrative squiggles",
      // not data. Y axis on + a 3-stop time axis underneath.
      // R2b: yFormat 'index'→'idx100' — the axis now reads as % change vs
      // 12 mo ago (matches the +18.4% / +22% badges) instead of raw
      // 93-129 "price levels" the re-review panel read as invented numbers.
      // v9 (report P0-5): 'today' → "Jul '26" — the film records in one
      // month and uploads in another; an axis that says "today" in November
      // is a four-months-stale claim in a channel whose currency is freshness.
      xLabels: [
        { at: 0, label: '12 mo ago' },
        { at: 20, label: '6 mo ago' },
        { at: 40, label: "Jul '26" },
      ],
    });
  });
  // extra badge (Nasdaq-100) — punchline chip in the top band (R2c: was a
  // full-width card at y 886-978, inside the caption pill zone)
  const eb = s.extraBadge as any | undefined;
  if (eb) {
    const ap = clamp01((t - 2000) / 700);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      const bx = W * 0.08;
      const by = 128;
      setFont(ctx, 46, 700);
      const bigW = ctx.measureText(eb.big).width;
      setFont(ctx, 28, 600);
      const labW = ctx.measureText(eb.label).width;
      const chipW = 36 + bigW + 24 + labW + 36;
      // v9 (report D-04): the punchline chip matches the Nasdaq gold tone
      // it quantifies (was teal on a teal-topped chart).
      const ebTone = TONE('gold').main;
      card(ctx, bx, by, chipW, 84, { r: 26 });
      setFont(ctx, 46, 700);
      ctx.fillStyle = ebTone;
      ctx.textAlign = 'left';
      ctx.fillText(eb.big, bx + 36, by + 56);
      setFont(ctx, 28, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.fillText(eb.label, bx + 36 + bigW + 24, by + 51);
      ctx.restore();
      if (ap >= 1) sparkles(ctx, bx + chipW / 2, by + 42, t, t - 2600, { count: 10, radius: 220 });
    }
  }
  sourceTag(ctx, W, s.source as string, H - 60);
  // PANEL-9 R2b (z-order): the host used to stand at (W*0.88, H*0.86) —
  // directly on the right chart's "today" x-label. Relocated to the empty
  // top-right quadrant above the chart cards, smaller, looking down at
  // the data; the full label strip along the card bottoms stays clear.
  hostSmall(g, W * 0.87, 'present', 3, H * 0.225, 0.66);
}

// ── chartJourney: the generic annotated line chart scene ────────────────────
export function chartJourneyScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 71);
  // v3 (panel P1-1): SceneCtx.t is GROUP-relative — it spans every beat
  // sharing a sceneKey — but props come from the CURRENT beat. In any
  // multi-beat group the animation clock is pre-advanced when later beats
  // begin, so staggered reveals never ran (verified: the c4-gallup group's
  // phase:'recovery' reveal was pinned at 1.0 the instant beat 2 started).
  // The chart's draw-on stays GROUP-relative (it draws once across the
  // group); per-beat content keys off beatT.
  const bt = g.beatT;
  const title = s.title as string;
  const drawP = clamp01(t / 2600);
  sceneTitle(ctx, title, 110, 190, clamp01(t / 600));
  const chartX = 190;
  const chartY = H * 0.22;
  const chartW = W - 190 - 210;
  const extraStats = (s.extraStats as any[]) || [];
  // v3 (panel P0-2 follow-up): with 2 stat rows the v2 stack reached
  // y 883-949 — under the caption pill. The chart yields a little height on
  // 2-stat beats so both rows sit fully above CAPTION_ZONE_TOP.
  const chartH = H * (extraStats.length >= 2 ? 0.355 : 0.42);

  const series = (s.series as any[] | undefined)?.map((sr) => ({
    name: sr.name as string,
    tone: sr.tone as string,
    points: sr.points as [number, number][],
  })) || [{ name: '', tone: 'up', points: s.points as [number, number][] }];

  // legend
  if (series.length > 1) {
    series.forEach((sr, i) => {
      const lx = chartX + i * 560;
      const ap = clamp01((t - 300 - i * 200) / 500);
      ctx.save();
      ctx.globalAlpha = ap;
      ctx.fillStyle = TONE(sr.tone).main;
      roundRect(ctx, lx, chartY - 34, 46, 12, 6);
      ctx.fill();
      setFont(ctx, 25, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.textAlign = 'left';
      ctx.fillText(sr.name, lx + 60, chartY - 20);
      ctx.restore();
    });
  }

  lineChart(ctx, {
    x: chartX, y: chartY + (series.length > 1 ? 40 : 0), w: chartW, h: chartH,
    series,
    annotations: (s.annotations as any[]) || [],
    band: s.band as any,
    peakBand: s.peakBand as any,
    p: drawP,
    t,
    yFormat: ((s.yFormat as string) || 'index') as any,
    // PANEL-9 R2: the hero journey chart now carries a real time axis —
    // x=0 is ~last October, the script dates the March low (x=11) and the
    // June record (x=20), so the stops line up with the annotations.
    xLabels: [
      { at: 0, label: 'last Oct' },
      { at: 11, label: 'Mar' },
      { at: 20, label: 'Jun' },
      { at: 40, label: 'today' },
    ],
    // v3 (panel P1-1): beat-relative — the reveal RE-RUNS as the recovery
    // beat's VO explains it, instead of arriving pre-pinned at 1.0
    revealFrac: s.phase === 'recovery' ? Math.max(0.75, clamp01((bt - 800) / 4000)) : undefined,
  });

  // extra stat chips — v3: beat-relative stagger + anchored above the band
  extraStats.forEach((st, i) => {
    const ap = clamp01((bt - 1400 - i * 500) / 700);
    if (ap <= 0) return;
    const c = TONE(st.tone || 'default');
    ctx.save();
    ctx.globalAlpha = ap;
    // bottom-anchored stack: last row's bottom edge sits at ~798 (design
    // grid), clear of the caption pill top (800/808)
    const cyy = ((732 - (extraStats.length - 1 - i) * 84) / 1080) * H;
    ctx.fillStyle = c.soft;
    roundRect(ctx, 190, cyy, 620, 66, 33);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(c.main, 0.4);
    roundRect(ctx, 190, cyy, 620, 66, 33);
    ctx.stroke();
    setFont(ctx, 36, 700);
    ctx.fillStyle = c.main;
    ctx.textAlign = 'left';
    ctx.fillText(st.big, 226, cyy + 46);
    setFont(ctx, 25, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    const label = st.label.length > 52 ? st.label.slice(0, 51) + '…' : st.label;
    ctx.fillText(label, 300, cyy + 43);
    ctx.restore();
  });

  // chips row — v3 (panel P0-2 + P1-1): the stack was uncapped and with 2+
  // extraStats the chips landed at y 821-989 — under the caption pill (top ≈
  // 808), hidden. Cap the whole stat + chip stack ≥64px above the reserved
  // band, and stagger off beatT so each beat's chips animate with its VO.
  const chips = (s.chips as string[]) || [];
  const chipsY = Math.min(
    H * 0.76 + extraStats.length * 84,
    ((CAPTION_ZONE_TOP - 64) / 1080) * H
  );
  chips.forEach((c, i) => {
    const ap = clamp01((g.beatT - 2200 - i * 450) / 600);
    if (ap <= 0) return;
    ctx.save();
    ctx.globalAlpha = ap;
    chip(ctx, c, 190 + i * 640, chipsY, {
      size: 24, iconDot: PALETTE.gold, alpha: 0.95,
    });
    ctx.restore();
  });

  // quote card
  const quote = s.quote as string | undefined;
  if (quote) {
    const ap = clamp01((t - 2400) / 800);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      const qw = 560;
      const qx = W - qw - 150;
      const qy = H * 0.6;
      card(ctx, qx, qy, qw, 190, { r: 26 });
      ctx.fillStyle = PALETTE.gold;
      roundRect(ctx, qx + 30, qy + 26, 6, 138, 3);
      ctx.fill();
      setFont(ctx, 27, 600);
      ctx.fillStyle = PALETTE.ink;
      wrapText(ctx, quote, qw - 80, 27, 600).forEach((ln, i) => {
        ctx.fillText(ln, qx + 56, qy + 64 + i * 38);
      });
      ctx.restore();
    }
  }

  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── pieChart scene wrapper ──────────────────────────────────────────────────
export function pieChartScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 81, 0.6);
  sceneTitle(ctx, s.title as string, 110, 190, clamp01(t / 600));
  const cx = W * 0.34;
  const cy = H * 0.52;
  const r = Math.min(W, H) * 0.21;
  pieChart(ctx, {
    cx, cy, r,
    slices: (s.slices as any[]) || [],
    p: clamp01(t / 1800),
    t,
    donut: !!s.donut,
    centerBig: s.centerBig as string,
  });
  // legend + host on right
  const legend = (s.slices as any[]) || [];
  legend.forEach((sl, i) => {
    const ap = clamp01((t - 700 - i * 300) / 600);
    if (ap <= 0) return;
    const ly = H * 0.4 + i * 90;
    registerRect(`pieLegend:${sl.label.slice(0, 12)}`, W * 0.58, ly, 700, 70);
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.fillStyle = TONE(sl.tone).main;
    roundRect(ctx, W * 0.58, ly, 52, 52, 14);
    ctx.fill();
    setFont(ctx, 30, 600);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'left';
    const lines = wrapText(ctx, sl.label, 420, 30, 600);
    lines.forEach((ln, j) => ctx.fillText(ln, W * 0.58 + 76, ly + 34 + j * 40));
    setFont(ctx, 38, 700);
    // v8.1: the bright fill gold (#C9A227) fails AA at 38px — text-sized
    // gold numerals use goldInk (4.8:1); the swatch chip stays bright.
    ctx.fillStyle = sl.tone === 'gold' ? PALETTE.goldInk : TONE(sl.tone).main;
    ctx.fillText(`${Math.round(sl.value)}%`, W * 0.58 + 560, ly + 40);
    ctx.restore();
  });
  hostSmall(g, W * 0.85, 'pointL', 6);
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── dotGrid scene ────────────────────────────────────────────────────────────
export function dotGridScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 91);
  sceneTitle(ctx, 'The S&P 500 · one bonus pool, 500 companies', 110, 190, clamp01(t / 600));
  dotGrid(ctx, {
    x: 190, y: H * 0.2, w: W - 400, h: H * 0.5,
    total: (s.total as number) || 500,
    highlight: (s.highlight as number) || 10,
    p: clamp01(t / 3400),
    t,
  });
  // bracket over the highlighted dots + caption
  // v8: "these ten" moved to the bracket's right end (the panel caught it
  // colliding with the scene-title underline above the grid)
  // v9 (report P0-6): count-up "10 of 500" badge — the panel's read was
  // that ten same-sized gold dots among 490 grey ones never registered as
  // a COUNT ("almost 4 dollars of every 10" didn't land). The dots are now
  // 1.7× with ink rings (charts.ts) and the bracket carries an explicit
  // count-up so the ratio is stated, not implied.
  const ap = clamp01((t - 2600) / 700);
  if (ap > 0) {
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 4;
    const bracketW = 10 * ((W - 400) / 25);
    ctx.beginPath();
    ctx.moveTo(196, H * 0.2 - 26);
    ctx.lineTo(196 + bracketW, H * 0.2 - 26);
    ctx.stroke();
    // count-up badge plate: 10 of 500
    const cp = clamp01((t - 2700) / 800);
    const n = Math.max(1, Math.round(10 * easeOutCubic(cp)));
    const badgeTxt = `${n} of 500`;
    setFont(ctx, 34, 700);
    const bw = ctx.measureText(badgeTxt).width + 44;
    const bx = 196 + bracketW + 22;
    const by = H * 0.2 - 26 - 27;
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, bx, by, bw, 54, 27);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = rgba(PALETTE.gold, 0.85);
    roundRect(ctx, bx, by, bw, 54, 27);
    ctx.stroke();
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeTxt, bx + 22, by + 28);
    ctx.textBaseline = 'alphabetic';
    registerRect('dotGrid:countBadge', bx, by, bw, 54);
    setFont(ctx, 30, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText('these ten', bx + bw + 20, H * 0.2 - 16);
    const caption = s.caption as string;
    setFont(ctx, 38, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    // v3 (panel P0-2): was H*0.82 (y≈885) / H*0.87 (y≈939) — both inside the
    // caption pill band. Move below the pill, above the progress bar.
    // v9 (report P0-1 guard): 988 grazed a 2-row pill's bottom (956) by 6px
    // of cap-height — 1004/1038 clears even the tallest pill with 12px spare.
    registerRect('dotGrid:caption', W / 2 - 500, (1008 / 1080) * H - 40, 1000, 46);
    ctx.fillText(caption, W / 2, (1008 / 1080) * H);
    setFont(ctx, 26, 600);
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.fillText('each dot = one company', W / 2, (1040 / 1080) * H);
    ctx.restore();
  }
  // PANEL-10 (D-10 class): W*0.9 → W*0.84 — dotGrid is a push scene (no
  // hero move, base 0.052); the envelope crossed x=1920 at full push.
  hostSmall(g, W * 0.84, 'present', 8);
}

// ── magChips scene ───────────────────────────────────────────────────────────
export function magChipsScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 101, 0.55);
  sceneTitle(ctx, 'The Magnificent Seven', 110, 190, clamp01(t / 600));
  const chipsList = (s.chips as string[]) || [];
  // 7 gold tiles with ticker-style look
  const tw = 210;
  const gap = 26;
  const totalW = chipsList.length * tw + (chipsList.length - 1) * gap;
  const startX = W / 2 - totalW / 2;
  chipsList.forEach((name, i) => {
    const ap = clamp01((t - 300 - i * 260) / 600);
    if (ap <= 0) return;
    const x = startX + i * (tw + gap);
    const y = H * 0.26;
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.translate(x + tw / 2, y + 62);
    ctx.scale(0.9 + 0.1 * easeOutBack(ap), 0.9 + 0.1 * easeOutBack(ap));
    ctx.translate(-(x + tw / 2), -(y + 62));
    card(ctx, x, y, tw, 124, { r: 22 });
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, x, y, tw, 124, 22);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = rgba(PALETTE.gold, 0.65);
    roundRect(ctx, x, y, tw, 124, 22);
    ctx.stroke();
    setFont(ctx, 30, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.fillText(name, x + tw / 2, y + 74);
    setFont(ctx, 24 + 4, 600); // v9 (D-07): TYPE_FLOOR 24→28 ("MAG n" kicker)
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText('MAG ' + (i + 1), x + tw / 2, y + 40);
    ctx.restore();
  });
  // stats below
  // v9 (report D-01): the stat stack sat at H*0.56 + i*120 — card 2
  // ("46% of earnings growth") spanned y 724.8–824.8, and the opaque
  // caption pill's top edge lands at 796 (2-row) — the pill plated the
  // number and its label mid-glyph (verified defect, panel frame E-magchips).
  // H*0.50 puts card 2 at 660–760: 36px clear of even a 2-row pill, with
  // the collision guard (P0-1) now asserting it stays that way.
  const stats = (s.stats as any[]) || [];
  stats.forEach((st, i) => {
    const ap = clamp01((t - 2400 - i * 700) / 800);
    if (ap <= 0) return;
    ctx.save();
    ctx.globalAlpha = ap;
    const y = H * 0.50 + i * 120;
    const c = TONE(st.tone || 'default');
    card(ctx, W * 0.14, y, W * 0.72, 100, { r: 26 });
    setFont(ctx, 56, 700);
    ctx.fillStyle = c.main;
    ctx.textAlign = 'left';
    ctx.fillText(st.big, W * 0.14 + 44, y + 68);
    setFont(ctx, 29, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText(st.label, W * 0.14 + 320, y + 62);
    ctx.restore();
  });
  if (t > 3200) sparkles(ctx, W / 2, H * 0.62, t, t - 3200, { count: 12, radius: 300, gold: true });
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── barsCompare scene ────────────────────────────────────────────────────────
export function barsCompareScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 111);
  sceneTitle(ctx, s.title as string, 110, 190, clamp01(t / 600));
  const bars = (s.bars as any[]) || [];
  const barW = W - 620;
  const yMax = (s.yMax as number) || Math.max(...bars.map((b) => b.value), 1) * 1.15;
  bars.forEach((b, i) => {
    const bp = clamp01((t - 400 - i * 450) / 900);
    if (bp <= 0) return;
    barRow(ctx, {
      x: 190, y: H * 0.24 + i * 130, w: barW, rowH: 120,
      label: b.label, value: b.value, maxV: yMax,
      p: bp, tone: b.tone, tag: b.tag,
    });
  });
  // flip counter (ownership rate)
  const fc = s.flipCounter as any | undefined;
  if (fc) {
    const ap = clamp01((t - 2600) / 900);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      const fx = W * 0.14;
      // PANEL-9 R7k (flip counter plated by the caption pill): was H*0.7
      // (756..886) — its label/tag baselines (814/848) sat behind the
      // two-row pill (top ≈796). H*0.60 keeps the whole card (648..778)
      // above CAPTION_ZONE_TOP, 9px under the last bar row.
      const fy = H * 0.6;
      card(ctx, fx, fy, 640, 130, { r: 26 });
      setFont(ctx, 62, 700);
      ctx.fillStyle = PALETTE.down;
      ctx.textAlign = 'left';
      const from = fc.from as number;
      const to = fc.to as number;
      const v = lerp(from, to, easeInOutCubic(ap));
      ctx.fillText(`${v.toFixed(0)}%`, fx + 40, fy + 82);
      setFont(ctx, 27, 600);
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.fillText(fc.label, fx + 210, fy + 58);
      setFont(ctx, TYPE_FLOOR, 600); // v9 (D-07): 24→28 floor (flip-counter tag)
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.fillText(fc.tag, fx + 210, fy + 92);
      ctx.restore();
    }
  }
  const rc = s.rememberChip as string | undefined;
  if (rc) {
    const ap = clamp01((t - 3600) / 800);
    if (ap > 0) {
      ctx.save();
      ctx.globalAlpha = ap;
      setFont(ctx, 26, 600);
      const tw = ctx.measureText(rc).width;
      const cx = W / 2 - tw / 2 - 28;
      // v3 (panel P0-2): was H-190 (y≈890) — inside the caption pill band,
      // which covered it. Anchor ≥70px above CAPTION_ZONE_TOP (chip h≈56).
      const cy = ((CAPTION_ZONE_TOP - 70) / 1080) * H;
      registerRect('barsCompare:rememberChip', cx, cy, tw + 56, 56);
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, cx, cy, tw + 56, 56, 28);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PALETTE.gold;
      roundRect(ctx, cx, cy, tw + 56, 56, 28);
      ctx.stroke();
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.textAlign = 'left';
      ctx.fillText(rc, cx + 28, cy + 36);
      ctx.restore();
    }
  }
  sourceTag(ctx, W, s.source as string, H - 60);
  hostSmall(g, W * 0.9, 'present', 13);
}

// ── trioConverge scene ───────────────────────────────────────────────────────
export function trioConvergeScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 121);
  sceneTitle(ctx, 'Three surveys. One shape.', 110, 190, clamp01(t / 600));
  const names = ['Gallup', 'Univ. of Michigan', 'Conference Board'];
  const arcs = [
    { tone: 'down', pts: [[0, 60], [3, 55], [6, 40], [9, 22], [10, 14], [12, 26], [14, 34], [15, 32]] },
    { tone: 'down', pts: [[0, 60], [3, 54], [6, 42], [9, 26], [10, 18], [12, 30], [14, 38], [15, 36]] },
    { tone: 'down', pts: [[0, 60], [3, 56], [6, 44], [9, 28], [10, 20], [12, 32], [14, 39], [15, 37]] },
  ];
  // v9 (report P0-6): the trio asserted "same shape" without showing a
  // single value — the panel read the minis as decorative squiggles. Each
  // card now carries its survey's REAL first→latest reading (the same
  // numbers the full charts showed earlier in the chapter): Gallup −45→−33,
  // UMich 52.2→60.1, Conference Board 88.2→92.3.
  const realValues = ['−45 → −33', '52.2 → 60.1', '88.2 → 92.3'];
  arcs.forEach((a, i) => {
    const ap = clamp01((t - 300 - i * 320) / 700);
    if (ap <= 0) return;
    const x = W * 0.09 + i * (W * 0.28);
    const y = H * 0.26;
    const w = W * 0.22;
    const h = H * 0.3;
    ctx.save();
    ctx.globalAlpha = ap;
    card(ctx, x, y, w, h + 40, { r: 26 });
    setFont(ctx, 26, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.fillText(names[i], x + w / 2, y + 52);
    // the real first→latest reading, bottom of card
    const vp = clamp01((t - 1800 - i * 320) / 600);
    ctx.globalAlpha = ap * vp;
    setFont(ctx, 30, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(realValues[i], x + w / 2, y + h + 6);
    ctx.globalAlpha = ap;
    setFont(ctx, 22 + 6, 600); // v9 (D-07): floor — "index, low→latest" caption
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.fillText('index · low → latest', x + w / 2, y + h + 34);
    registerRect(`trio:${names[i]}`, x, y, w, h + 40);
    ctx.restore();
    lineChart(ctx, {
      x: x + 36, y: y + 84, w: w - 72, h: h - 90,
      series: [{ name: '', tone: a.tone, points: a.pts as [number, number][] }],
      p: clamp01((t - 500 - i * 320) / 1600),
      t, showYAxis: false, gridLines: 2, emphasizeLast: false,
    });
  });
  // converge → checkmark
  const cp = clamp01((t - 2600) / 900);
  // motto hand-off progress (computed early — the checkmark caption fades
  // out into the motto which takes over its slot)
  const mottoIn = clamp01((t - 3600) / 700);
  if (cp > 0) {
    ctx.save();
    ctx.globalAlpha = cp;
    const cx = W / 2;
    const cy = H * 0.78;
    // three lines converge to a point
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const sx = W * 0.09 + W * 0.11 + i * (W * 0.28);
      ctx.strokeStyle = rgba(PALETTE.grid, 0.8);
      ctx.beginPath();
      ctx.moveTo(sx, H * 0.6);
      ctx.lineTo(cx + lerp(-60, 0, cp) * (i - 1), cy - 40);
      ctx.stroke();
    }
    // checkmark draws
    ctx.strokeStyle = PALETTE.up;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(cx - 46, cy);
    ctx.lineTo(cx - 12, cy + 32 * easeOutCubic(cp));
    ctx.stroke();
    if (cp > 0.4) {
      const p2 = clamp01((cp - 0.4) / 0.6);
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy + 32);
      ctx.lineTo(cx + 52, cy - 44 * p2);
      ctx.stroke();
    }
    // v3 (panel P0-2): was cy+96 (y≈938) — inside the caption pill band.
    // Shares the below-the-pill slot with the motto via a crossfade (the
    // line hands off to the motto as the beat lands).
    setFont(ctx, 34, 700);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.globalAlpha = cp * (1 - mottoIn);
    ctx.fillText('same shape · same time', cx, (1000 / 1080) * H);
    ctx.restore();
  }
  // crossfade target — the motto uses the same slot the caption line vacated
  const motto = s.motto as string;
  const mp = mottoIn;
  if (mp > 0 && motto) {
    ctx.save();
    ctx.globalAlpha = mp;
    ctx.textAlign = 'center';
    setFont(ctx, 40, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText(motto, W / 2, (1000 / 1080) * H);
    setFont(ctx, 26, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText(s.sub as string, W / 2, (1035 / 1080) * H);
    ctx.restore();
  }
}

// ── kDef scene ───────────────────────────────────────────────────────────────
export function kDefScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 131, 0.5);
  const kx = W * 0.7;
  const ky = H * 0.48;
  const S = 190;
  // two population dots travel apart from one point
  const travel = clamp01((t - 600) / 2200);
  const dotGap = lerp(0, 1, easeInOutCubic(travel));
  ctx.save();
  // stem
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  const stemP = clamp01(t / 700);
  ctx.beginPath();
  ctx.moveTo(kx, ky - S * stemP);
  ctx.lineTo(kx, ky + S * stemP);
  ctx.stroke();
  // arms
  if (travel > 0.15) {
    ctx.strokeStyle = PALETTE.up;
    ctx.lineWidth = 20;
    const ap2 = clamp01((travel - 0.15) / 0.85);
    ctx.beginPath();
    ctx.moveTo(kx, ky + S * 0.1);
    ctx.lineTo(kx + S * 1.15 * ap2, ky - S * 1.05 * ap2);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.down;
    ctx.beginPath();
    ctx.moveTo(kx, ky + S * 0.1);
    ctx.lineTo(kx + S * 1.15 * ap2, ky + S * 1.05 * ap2);
    ctx.stroke();
  }
  // travelers
  ctx.fillStyle = PALETTE.up;
  ctx.beginPath();
  ctx.arc(kx + S * 1.15 * dotGap, ky - S * 1.05 * dotGap, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.down;
  ctx.beginPath();
  ctx.arc(kx + S * 1.15 * dotGap, ky + S * 1.05 * dotGap, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // definition card
  const dp = clamp01((t - 900) / 800);
  if (dp > 0) {
    ctx.save();
    ctx.globalAlpha = dp;
    const dx = W * 0.08;
    const dy = H * 0.24;
    card(ctx, dx, dy, 620, 300, { r: 30 });
    setFont(ctx, 27, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText('THE RICHMOND FED, PLAINLY', dx + 40, dy + 58);
    setFont(ctx, 33, 600);
    ctx.fillStyle = PALETTE.ink;
    wrapText(ctx, `“${s.definition as string}”`, 540, 33, 600).forEach((ln, i) => {
      ctx.fillText(ln, dx + 40, dy + 116 + i * 46);
    });
    setFont(ctx, 24, 600);
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.fillText('same starting point · same economy · two lines that diverge', dx + 40, dy + 262);
    ctx.restore();
  }
  // arm labels
  const lp = clamp01((t - 2400) / 700);
  if (lp > 0) {
    ctx.save();
    ctx.globalAlpha = lp;
    setFont(ctx, 28, 700);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.up;
    ctx.fillText('top: better', kx + S * 1.3, ky - S * 1.0);
    ctx.fillStyle = PALETTE.down;
    ctx.fillText('bottom: worse', kx + S * 1.3, ky + S * 1.15);
    ctx.restore();
  }
  hostSmall(g, W * 0.24, 'pointR', 15);
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── credibilityChips ─────────────────────────────────────────────────────────
export function credibilityChipsScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 141, 0.6);
  sceneTitle(ctx, 'This isn\u2019t an internet theory', 110, 190, clamp01(t / 600));
  const chipsList = (s.chips as string[]) || [];
  const cw = 640;
  chipsList.forEach((c, i) => {
    const ap = clamp01((t - 400 - i * 340) / 650);
    if (ap <= 0) return;
    const y = H * 0.24 + i * 106;
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.translate((1 - easeOutCubic(ap)) * -50, 0);
    card(ctx, W / 2 - cw / 2, y, cw, 84, { r: 24 });
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, W / 2 - cw / 2, y, 14, 84, 7);
    ctx.fill();
    setFont(ctx, 31, 600);
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = 'center';
    ctx.fillText(c, W / 2, y + 54);
    ctx.restore();
  });
  const yp = clamp01((t - 2600) / 700);
  if (yp > 0) {
    ctx.save();
    ctx.globalAlpha = yp;
    ctx.textAlign = 'center';
    setFont(ctx, 30, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText(s.year as string, W / 2, H * 0.24 + chipsList.length * 106 + 60);
    ctx.restore();
  }
  hostSmall(g, W * 0.87, 'present', 16);
}

// ── gasPump scene ────────────────────────────────────────────────────────────
export function gasPumpScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 151, 0.5);
  sceneTitle(ctx, 'Same shock — different roads', 110, 190, clamp01(t / 600));
  // the pump (center) — v8: the vision panel called the old beige-screen
  // pump "clip-art from 2012". A modern pump reads as: white body, crisp
  // hairline, a soft-TEAL screen (no dark tones — the theme's upSoft wash)
  // with ink digits on a white price plate. Same silhouette, same price
  // roll animation, ten lines of change.
  const px = W * 0.5;
  const py = H * 0.3;
  const ap = clamp01(t / 800);
  ctx.save();
  ctx.globalAlpha = ap;
  // pump body
  card(ctx, px - 110, py, 220, 330, { r: 26 });
  // teal screen wash (was goldWash beige)
  ctx.fillStyle = PALETTE.upSoft;
  roundRect(ctx, px - 82, py + 28, 164, 110, 18);
  ctx.fill();
  setFont(ctx, 44, 700);
  ctx.fillStyle = PALETTE.up;
  ctx.textAlign = 'center';
  ctx.fillText('GAS', px, py + 92);
  // price digits roll — on a clean white plate now
  const roll = (t / 300) % 10;
  setFont(ctx, 40, 700);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(`$${(3.2 + Math.abs(Math.sin(roll)) * 0.9).toFixed(2)}`, px, py + 190);
  // hose
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px + 110, py + 60);
  ctx.quadraticCurveTo(px + 180, py + 120, px + 140, py + 210);
  ctx.stroke();
  ctx.restore();
  floatCoins(ctx, px, py + 40, t, 4, 60);

  // two household cards
  const cards = (s.cards as any[]) || [];
  cards.forEach((c, i) => {
    const cap = clamp01((t - 1000 - i * 900) / 800);
    if (cap <= 0) return;
    const x = i === 0 ? W * 0.07 : W * 0.66;
    const y = H * 0.26;
    ctx.save();
    ctx.globalAlpha = cap;
    ctx.translate(0, (1 - easeOutCubic(cap)) * 40);
    const tone = TONE(c.tone);
    card(ctx, x, y, 480, 300, { r: 30 });
    setFont(ctx, 27, 700);
    ctx.fillStyle = tone.main;
    ctx.textAlign = 'left';
    ctx.fillText(c.who.toUpperCase(), x + 40, y + 62);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(tone.main, 0.4);
    ctx.beginPath();
    ctx.moveTo(x + 40, y + 84);
    ctx.lineTo(x + 200, y + 84);
    ctx.stroke();
    (c.stats as string[]).forEach((st, j) => {
      setFont(ctx, 44, 700);
      ctx.fillStyle = j === 0 ? tone.main : PALETTE.ink;
      ctx.fillText(st, x + 40, y + 150 + j * 84);
    });
    ctx.restore();
  });
  const cap2 = clamp01((t - 3000) / 700);
  if (cap2 > 0) {
    ctx.save();
    ctx.globalAlpha = cap2;
    ctx.textAlign = 'center';
    setFont(ctx, 34, 700);
    ctx.fillStyle = PALETTE.ink;
    // v3 (panel P0-2): was H*0.82 (y≈885) — inside the caption pill band.
    ctx.fillText(`${s.caption as string} — same country, same price shock`, W / 2, (992 / 1080) * H);
    ctx.restore();
  }
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── recessionGauge scene ─────────────────────────────────────────────────────
export function recessionGaugeScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 161);
  sceneTitle(ctx, 'Recession odds — serious people, different answers', 110, 190, clamp01(t / 600));
  // debates on left
  const debates = (s.debates as any[]) || [];
  debates.forEach((d, i) => {
    const ap = clamp01((t - 400 - i * 600) / 700);
    if (ap <= 0) return;
    ctx.save();
    ctx.globalAlpha = ap;
    const y = H * 0.26 + i * 150;
    card(ctx, W * 0.07, y, 560, 120, { r: 26 });
    setFont(ctx, 26, 700);
    ctx.fillStyle = i === 0 ? PALETTE.up : PALETTE.down;
    ctx.textAlign = 'left';
    ctx.fillText(d.who, W * 0.07 + 36, y + 44);
    setFont(ctx, 24, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    wrapText(ctx, d.line, 490, 24, 600).forEach((ln, j) => {
      ctx.fillText(ln, W * 0.07 + 36, y + 82 + j * 32);
    });
    ctx.restore();
  });
  // gauge on right
  gauge(ctx, {
    cx: W * 0.74, cy: H * 0.52, r: 240,
    value: (s.gaugeTo as number) || 48,
    p: clamp01((t - 1200) / 2200),
    t,
    label: 'Zandi\u2019s model · most alarmed point',
  });
  // v8: the mid-roll engagement chip — asks for the viewer's guess WHILE
  // the gauge is still sweeping toward 48%. Comments during the video (not
  // just at the end) are a ranking signal, and "guess before the reveal"
  // is a proven engagement device. Rides above the debates, below the
  // caption zone, and fades before the coin chip lands.
  const promptChip = s.promptChip as string | undefined;
  if (promptChip) {
    const pp = clamp01((t - 2000) / 600) * (1 - clamp01((t - 5600) / 700));
    if (pp > 0) {
      ctx.save();
      ctx.globalAlpha = pp;
      setFont(ctx, 27, 700);
      const tw = ctx.measureText(promptChip).width;
      const cx0 = W * 0.35;
      const x = cx0 - tw / 2 - 28;
      const y = 626;
      registerRect('gauge:promptChip', x, y, tw + 56, 56);
      ctx.fillStyle = PALETTE.upSoft;
      roundRect(ctx, x, y, tw + 56, 56, 28);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(PALETTE.up, 0.7);
      roundRect(ctx, x, y, tw + 56, 56, 28);
      ctx.stroke();
      ctx.fillStyle = PALETTE.up;
      ctx.textAlign = 'left';
      ctx.fillText(promptChip, x + 28, y + 37);
      ctx.restore();
    }
  }
  // coin flip chip — v4 (vision panel re-review): was at y=H*0.8 (864) —
  // inside the caption-pill band (top ≈ 808), colliding with the subtitle.
  // Now cradled inside the gauge bowl, under the value + model label, clear
  // of both the arc and the caption zone.
  const cp = clamp01((t - 3200) / 700);
  if (cp > 0 && s.coinChip) {
    ctx.save();
    ctx.globalAlpha = cp;
    setFont(ctx, 27, 700);
    const txt = s.coinChip as string;
    const tw = ctx.measureText(txt).width;
    const gx = W * 0.74;
    const x = gx - tw / 2 - 28;
    const y = 736;
    registerRect('gauge:coinChip', x, y, tw + 56, 56);
    ctx.fillStyle = PALETTE.goldWash;
    roundRect(ctx, x, y, tw + 56, 56, 28);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PALETTE.gold;
    roundRect(ctx, x, y, tw + 56, 56, 28);
    ctx.stroke();
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText(txt, x + 28, y + 37);
    ctx.restore();
  }
  sourceTag(ctx, W, s.source as string, H - 60);
}

// ── aiDatacenter scene (3D-ish racks) ───────────────────────────────────────
export function aiDatacenterScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  paintBg(ctx, W, H, t, g.chapterTone);
  bokehField(ctx, W, H, t, { intensity: 1.15, seed: 171, gold: 0.5 });
  // perspective floor grid
  const horizon = H * 0.56;
  ctx.save();
  ctx.strokeStyle = rgba(PALETTE.grid, 0.4);
  ctx.lineWidth = 1.6;
  for (let i = 0; i <= 14; i++) {
    const fx = (i / 14) * W;
    ctx.beginPath();
    ctx.moveTo(fx, H);
    ctx.lineTo(lerp(fx, W / 2, 0.72), horizon);
    ctx.stroke();
  }
  for (let i = 0; i <= 8; i++) {
    const fy = horizon + Math.pow(i / 8, 1.8) * (H - horizon);
    ctx.globalAlpha = 0.35 + (i / 8) * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(W, fy);
    ctx.stroke();
  }
  ctx.restore();

  // isometric server racks scrolling
  const scroll = (t / 260) % 3;
  for (let i = 0; i < 5; i++) {
    const lane = ((i + scroll) % 5) - 2;
    const depth = 1 - Math.abs(lane) / 3.4;
    const x = W / 2 + lane * 300;
    const y = horizon + 40 + Math.abs(lane) * 26;
    const rw = 150 * depth;
    const rh = 190 * depth;
    const ap = clamp01(t / 600);
    ctx.save();
    ctx.globalAlpha = ap * (0.5 + depth * 0.5);
    // rack body (3D-ish box)
    ctx.fillStyle = rgba('#FFFFFF', 0.9);
    roundRect(ctx, x - rw / 2, y - rh, rw, rh, 10);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(PALETTE.grid, 0.8);
    roundRect(ctx, x - rw / 2, y - rh, rw, rh, 10);
    ctx.stroke();
    // blinking lights
    for (let k = 0; k < 6; k++) {
      const on = Math.sin(t / 200 + i * 3 + k * 1.7) > 0.2;
      ctx.fillStyle = on ? (k % 3 === 0 ? PALETTE.gold : PALETTE.up) : rgba(PALETTE.grid, 0.5);
      ctx.beginPath();
      ctx.arc(x - rw / 2 + 18 + (k % 3) * 22, y - rh + 24 + Math.floor(k / 3) * 34, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // stat cards cascade — v4 (audit P0-1): restacked as one clean vertical
  // column with FULL content visible. The v3 layout (h:112, i*128) drew the
  // 88px numeral at y+138 and the label from y+190 — physically outside the
  // card body, overpainted by the next card, so the top card shipped as a
  // lone "¾". Compact metrics (58px numeral, 24px label) fit a 172px card;
  // three cards + gaps end at y≈722, clear of the caption zone (y≥800).
  const stats = (s.stats as any[]) || [];
  stats.forEach((st, i) => {
    statCard(ctx, {
      x: W * 0.06, y: 168 + i * 186, w: 640, h: 172,
      compact: true,
      bigIsNumber: false, // '¾' / '$700–730B' are strings; count-up mangles them
      big: st.big, label: st.label, tone: st.tone || 'gold',
      p: clamp01((t - 800 - i * 900) / 900), t,
    });
  });
  if (t > 3600) sparkles(ctx, W * 0.41, H * 0.3, t, t - 3600, { count: 10, radius: 160 });
  // v8: the host — the vision panel flagged this scene "no character, no
  // motion cue, lowest energy on the sheet". The presenter now walks the
  // datacenter floor (bottom-right, presenting the racks) with the talk
  // envelope. One drawStickmanV2 call; the scene keeps its full layout.
  {
    const pose = Stickman.poseAt(t, { gesture: 'present', speaking: g.speaking });
    const talk = g.speaking ? talkAt(g.beatT, g.wordTimes) : 0;
    // v9 (report D-02): H*0.88 → H*0.68 — above the caption zone with
    // worst-case camera margin (guard-verified)
    // P1-1 (report): +30% (1.05 → 1.37); ground H*0.68 → H*0.66 — envelope
    // bottom 713+49 = 762, still clear of the worst-case 2-row pill
    // envelope (776) by 14px.
    // PANEL-10 (D-10): x W*0.9 → W*0.82. At scale 1.37 the feet+shadow
    // envelope reached x≈1895 static; the ch5 hero push (base 0.052 + hero
    // 0.04 ≈ 1.092x at group end) pushed it to ≈2004 — 84px past the right
    // edge, arm and shadow clipped (vision-verified on the aiDatacenter
    // frame). At W*0.82 the envelope's worst case lands ≈1831, 89px clear.
    drawStickmanV2(ctx, W * 0.82, H * 0.66, 1.37, t,
      { pose, alpha: clamp01((t - 900) / 600), look: -0.7, scarf: true, talk }, 27);
  }
}

// ── statCards scene ──────────────────────────────────────────────────────────
export function statCardsScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 181, 0.55);
  sceneTitle(ctx, 'The numbers, plainly', 110, 190, clamp01(t / 600));
  const cards = (s.cards as any[]) || [];
  const cw = (W - 110 * 2 - 60 * (cards.length - 1)) / cards.length;
  cards.forEach((c, i) => {
    statCard(ctx, {
      x: 110 + i * (cw + 60), y: H * 0.24, w: cw, h: 360,
      big: c.big, label: c.label, tag: c.tag, tone: c.tone || 'up',
      p: clamp01((t - 300 - i * 550) / 1000), t,
    });
    if (t > 1300 + i * 550 && t < 1300 + i * 550 + 900) {
      sparkles(ctx, 110 + i * (cw + 60) + cw / 2, H * 0.24 + 90, t, t - (1300 + i * 550), { count: 8, radius: 110 });
    }
  });
  sourceTag(ctx, W, s.source as string, H - 60);
  // PANEL-10 (D-10 class): W*0.88 → W*0.84 — the shadow envelope crossed
  // x=1920 under the base push stack; 0.84 clears it with margin.
  hostSmall(g, W * 0.84, 'present', 19);
}

// ── ownerWorker scene ────────────────────────────────────────────────────────
export function ownerWorkerScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 191);
  const L = s.left as any;
  const R = s.right as any;
  // divider
  ctx.save();
  ctx.strokeStyle = rgba(PALETTE.grid, 0.6);
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 12]);
  ctx.beginPath();
  ctx.moveTo(W / 2, H * 0.18);
  ctx.lineTo(W / 2, H * 0.8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const panels: [any, number, string][] = [[L, W * 0.08, 'left'], [R, W * 0.55, 'right']];
  panels.forEach(([pnl, x, side], i) => {
    const ap = clamp01((t - i * 700) / 800);
    if (ap <= 0) return;
    const tone = TONE(pnl.tone);
    ctx.save();
    ctx.globalAlpha = ap;
    ctx.textAlign = 'center';
    setFont(ctx, 34, 700);
    ctx.fillStyle = tone.main;
    ctx.fillText(pnl.title.toUpperCase(), x + 340, H * 0.24);
    // mini stickman: shareholder on a rising line / worker on flat ground
    // PANEL-9 R7d (panel text plated by the caption pill): the figure stood
    // at H*0.72 with its wrap lines at H*0.85+j*44 (918/962) — the second
    // line dead inside the caption band (two-row pill tops at y=796), so
    // the opaque pill plated over the panel text and left "gai…" / "…oesn't"
    // fragments peeking past its edges (flagged on the ownerWorker render).
    // Figure now at H*0.60, wrap lines at 726/768 — everything, including
    // descenders, clears CAPTION_ZONE_TOP with ~20px to spare.
    const hx = x + 340;
    const hy = H * 0.6;
    if (side === 'left') {
      ctx.strokeStyle = rgba(PALETTE.up, 0.8);
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - 170, hy + 26);
      ctx.lineTo(hx + 170, hy - 90);
      ctx.stroke();
    } else {
      ctx.strokeStyle = rgba(PALETTE.grid, 0.7);
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - 170, hy + 20);
      ctx.lineTo(hx + 170, hy + 20);
      ctx.stroke();
    }
    const pose = side === 'left'
      ? blendPose(POSES.climb, POSES.climb, 0)
      : POSES.shrug;
    // v3 (panel P0-3): v2 renderer — the shareholder/worker figures match the
    // presenter's body style (they read as the same world)
    drawStickmanV2(ctx, hx, hy - (side === 'left' ? 44 : 0), 0.86, t, {
      pose: side === 'left' ? { ...pose, lean: 12 } : pose,
      alpha: clamp01((t - i * 700 - 200) / 500),
      look: 0.3,
    }, 21 + i);
    setFont(ctx, 30, 600);
    ctx.fillStyle = PALETTE.inkSoft;
    // R7d: baselines 726 / 768 (was 918 / 962) — above CAPTION_ZONE_TOP,
    // 46px below the figure's ground line so the two never touch.
    wrapText(ctx, pnl.line, 560, 30, 600).forEach((ln, j) => {
      ctx.fillText(ln, hx, hy + 78 + j * 42);
    });
    ctx.restore();
  });
  floatCoins(ctx, W * 0.42, H * 0.5, t, 4, 80);
}

// ── fundSplit scene ──────────────────────────────────────────────────────────
export function fundSplitScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 201, 0.5);
  // (title row 150->190 as all sceneTitle sites — D-08; see charts.sceneTitle)
  sceneTitle(ctx, 'What\u2019s inside “the S&P 500”?', 110, 190, clamp01(t / 600));
  // the fund box
  const bx = W * 0.09;
  const by = H * 0.24;
  const bw = 430;
  // PANEL-10 (D-11): bh 120 -> 150. The subtitle '500 companies · feels
  // diversified' at the 28px floor measures ≈540px — it ran ≈180px past the
  // 430px card's right edge into the split arrows (the vision panel read it
  // as a chevron cutting the card). It now wraps to two measured lines that
  // fit bw-72, and the card grew to hold them without violating the floor.
  const bh = 150;
  const ap = clamp01(t / 700);
  ctx.save();
  ctx.globalAlpha = ap;
  card(ctx, bx, by, bw, bh, { r: 26 });
  setFont(ctx, 33, 700);
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'left';
  ctx.fillText('S&P 500 index fund', bx + 36, by + 56);
  setFont(ctx, TYPE_FLOOR, 600); // v9 (D-07): 24→28 floor
  ctx.fillStyle = PALETTE.inkFaint;
  // PANEL-10 (D-11): wrap inside bw-72 — never wider than the card, so it
  // can no longer reach the split arrows' zone at x>=623.
  const subLines = wrapText(ctx, '500 companies · feels diversified', bw - 72, TYPE_FLOOR, 600).slice(0, 2);
  subLines.forEach((ln, j) => ctx.fillText(ln, bx + 36, by + 92 + j * 34));
  ctx.restore();

  // split arrows
  const sp = clamp01((t - 800) / 700);
  if (sp > 0) {
    ctx.save();
    ctx.globalAlpha = sp;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + bw + 20, by + bh / 2);
    ctx.lineTo(bx + bw + 150, by - 30);
    ctx.moveTo(bx + bw + 20, by + bh / 2);
    ctx.lineTo(bx + bw + 150, by + 170);
    ctx.stroke();
    ctx.restore();
  }

  // 7 gold bars vs 493 gray bars (dot strip)
  const gp = clamp01((t - 1400) / 900);
  if (gp > 0) {
    const gx = W * 0.42;
    const gy = H * 0.18;
    // gold segment
    for (let i = 0; i < 7; i++) {
      const p2 = clamp01((t - 1400 - i * 90) / 400);
      ctx.fillStyle = PALETTE.gold;
      roundRect(ctx, gx + i * 34, gy, 26, 120 * easeOutCubic(p2) + 6, 8);
      ctx.fill();
    }
    setFont(ctx, 30, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.textAlign = 'left';
    ctx.fillText('7 stocks', gx, gy + 165);
    // gray mass
    const grayX = gx + 7 * 34 + 90;
    for (let i = 0; i < 60; i++) {
      const p2 = clamp01((t - 1900 - i * 6) / 500);
      ctx.fillStyle = rgba(PALETTE.grid, 0.6);
      const col = i % 30;
      const row = Math.floor(i / 30);
      roundRect(ctx, grayX + col * 17, gy + row * 44 + 14, 10, 32 * easeOutCubic(p2) + 4, 3);
      ctx.fill();
    }
    setFont(ctx, 30, 700);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText('493 others', grayX, gy + 165);
  }

  // stats
  const stats = (s.stats as any[]) || [];
  stats.forEach((st, i) => {
    const sp2 = clamp01((t - 2600 - i * 700) / 800);
    if (sp2 <= 0) return;
    ctx.save();
    ctx.globalAlpha = sp2;
    // PANEL-9 R7e (stat card 2 plated by the caption pill): the stack began
    // at H*0.58 (626) with a 110 step — card 2 ran 736..828, its bottom 32px
    // and label descenders inside the caption band (two-row pill tops at
    // 796). The stack now starts at H*0.50 with a 98 step: card 2 ends at
    // 730, a full 66px clear of the tallest pill.
    const y = H * 0.5 + i * 98;
    const c = TONE(st.tone || 'default');
    card(ctx, W * 0.42, y, 640, 92, { r: 24 });
    setFont(ctx, 50, 700);
    ctx.fillStyle = c.main;
    ctx.textAlign = 'left';
    ctx.fillText(st.big, W * 0.42 + 36, y + 62);
    // PANEL-9 R7o (stat label overflowing the card): the label was drawn at
    // a FIXED +230px offset with no measurement — "of the S&P 500's total
    // return in 2025 · seven stocks" (~750px at 25px) ran ~340px past the
    // 640px card's right edge onto the background (flagged on fundSplit).
    // The label now starts after the MEASURED big numeral and wraps inside
    // the remaining card width (two rows max, vertically centred). The
    // numeral is measured in ITS OWN 50px face before the label font loads.
    const bigW = ctx.measureText(st.big).width;
    setFont(ctx, 25, 600);
    const labelX = W * 0.42 + 36 + bigW + 26;
    const maxLW = W * 0.42 + 640 - 18 - labelX;
    const labelLines = maxLW > 120 ? wrapText(ctx, st.label, maxLW, 25, 600) : [];
    ctx.fillStyle = PALETTE.inkSoft;
    if (labelLines.length <= 1) {
      ctx.fillText(labelLines[0] ?? st.label, labelX, y + 56);
    } else {
      labelLines.slice(0, 2).forEach((ln, j) => {
        ctx.fillText(ln, labelX, y + 40 + j * 30);
      });
    }
    ctx.restore();
  });

  // callback chip
  const cb = s.callbackChip as string | undefined;
  if (cb) {
    const cp2 = clamp01((t - 4200) / 800);
    if (cp2 > 0) {
      ctx.save();
      ctx.globalAlpha = cp2;
      // PANEL-10 (D-07 sibling): 26 -> TYPE_FLOOR (28) — the chip was the
      // last sub-floor reading text in the film.
      setFont(ctx, TYPE_FLOOR, 600);
      const tw = ctx.measureText(cb).width;
      // PANEL-10 (D-09): was chy=966, verified only as a STATIC frame. The
      // ch6 hero move was then changed to a camera 'rise' (P1-2), which
      // lifted the chip 80px into the caption pill band — the pill plated
      // its top half on every frame past ~40% of the group. The rise is now
      // a truck (y never moves), and the chip is re-anchored at 996 in the
      // below-pill gap: pill bottom ≈956, progress bar ≈1072 — the chip sits
      // ~40px clear of the pill and ~26px above the bar, and survives the
      // 34px exit lift with ≥2px to spare (guard v2 sweeps it — it is now
      // REGISTERED, which is how D-09 escaped the v9 sweep in the first
      // place: unregistered content is invisible to the guard).
      const chy = 996;
      registerRect('fundSplit:callbackChip', W / 2 - tw / 2 - 28, chy, tw + 56, 54);
      ctx.fillStyle = PALETTE.goldWash;
      roundRect(ctx, W / 2 - tw / 2 - 28, chy, tw + 56, 54, 27);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = PALETTE.gold;
      roundRect(ctx, W / 2 - tw / 2 - 28, chy, tw + 56, 54, 27);
      ctx.stroke();
      ctx.fillStyle = PALETTE.goldDeep;
      ctx.textAlign = 'left';
      ctx.fillText(cb, W / 2 - tw / 2, chy + 36);
      ctx.restore();
    }
  }
  // PANEL-10 (D-10 class): host W*0.88 -> W*0.84 — under the truck+push
  // camera stack the shadow envelope (right edge ≈x1899 static) crossed
  // x=1920; at W*0.84 the envelope clears the edge under the full stack.
  hostSmall(g, W * 0.84, 'pointL', 24);
}

// ── oddsSpread scene ─────────────────────────────────────────────────────────
export function oddsSpreadScene(g: SceneCtx): void {
  const { ctx, W, H, t, s } = g;
  bg(g, 211);
  sceneTitle(ctx, 'Recession odds — the honest range', 110, 190, clamp01(t / 600));
  const trackY = H * 0.42;
  const trackX = 220;
  const trackW = W - 440;
  // axis 0..100
  const ap = clamp01(t / 800);
  ctx.save();
  ctx.globalAlpha = ap;
  ctx.fillStyle = rgba(PALETTE.track, 0.35);
  roundRect(ctx, trackX, trackY - 12, trackW, 24, 12);
  ctx.fill();
  for (let v = 0; v <= 100; v += 25) {
    const x = trackX + (v / 100) * trackW;
    setFont(ctx, TYPE_FLOOR, 600); // v9 (D-07): 24→28 floor
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.textAlign = 'center';
    ctx.fillText(`${v}%`, x, trackY + 52);
  }
  ctx.restore();

  const markers = (s.markers as any[]) || [];
  markers.forEach((m, i) => {
    const mp = clamp01((t - 700 - i * 650) / 700);
    if (mp <= 0) return;
    const x = trackX + (clamp01(m.at / 100)) * trackW;
    const c = TONE(m.tone);
    ctx.save();
    ctx.globalAlpha = mp;
    // band
    if (m.band) {
      const x0 = trackX + (m.band[0] / 100) * trackW;
      const x1 = trackX + (m.band[1] / 100) * trackW;
      ctx.fillStyle = rgba(c.main, 0.22);
      roundRect(ctx, x0, trackY - 12, x1 - x0, 24, 12);
      ctx.fill();
    }
    // pin
    const drop = (1 - easeOutBack(mp)) * -40;
    ctx.strokeStyle = rgba(c.main, 0.5);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, trackY - 12);
    ctx.lineTo(x, trackY - 90 + drop);
    ctx.stroke();
    ctx.fillStyle = c.main;
    ctx.beginPath();
    ctx.arc(x, trackY, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, trackY, 6, 0, Math.PI * 2);
    ctx.fill();
    // label card
    setFont(ctx, 24, 600);
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, m.label, 330, 24, 600);
    const cw2 = 350;
    const chh2 = 30 + lines.length * 32 + 18;
    const cy2 = trackY - 100 - chh2 + drop;
    const cx2 = Math.min(Math.max(x, trackX + cw2 / 2), trackX + trackW - cw2 / 2);
    ctx.fillStyle = '#fff';
    roundRect(ctx, cx2 - cw2 / 2, cy2, cw2, chh2, 18);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(c.main, 0.5);
    roundRect(ctx, cx2 - cw2 / 2, cy2, cw2, chh2, 18);
    ctx.stroke();
    ctx.fillStyle = c.main;
    lines.forEach((ln, j) => ctx.fillText(ln, cx2, cy2 + 42 + j * 32));
    ctx.restore();
  });

  const kp = clamp01((t - 4200) / 700);
  if (kp > 0 && s.kicker) {
    ctx.save();
    ctx.globalAlpha = kp;
    ctx.textAlign = 'center';
    setFont(ctx, 40, 700);
    ctx.fillStyle = PALETTE.goldDeep;
    ctx.fillText(s.kicker as string, W / 2, H * 0.68);
    ctx.restore();
  }
  const cl = clamp01((t - 5200) / 800);
  if (cl > 0 && s.closer) {
    ctx.save();
    ctx.globalAlpha = cl;
    ctx.textAlign = 'center';
    setFont(ctx, 30, 600);
    ctx.fillStyle = PALETTE.ink;
    // v3 (panel P0-2): was H*0.78 (y≈842) — inside the caption band, hidden
    // behind the pill. Sit ≥48px above CAPTION_ZONE_TOP.
    ctx.fillText(s.closer as string, W / 2, ((CAPTION_ZONE_TOP - 48) / 1080) * H);
    ctx.restore();
  }
  sourceTag(ctx, W, s.source as string, H - 60);
}

export { drawK3D, drawK, glowBlob };
